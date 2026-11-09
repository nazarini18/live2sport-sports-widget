/* Shared live-score transport. Bundled locally; no external JavaScript dependency. */
(function (w) {
    'use strict';
    if (w.SportsLiveScores) return;
    var subscriptions = new Map(), timer = null, running = false, controller = null;
    function text(value) { var t = value == null ? '' : String(value).trim(); return /^(False|None|null)$/i.test(t) ? '' : t; }
    function esc(value) { return text(value).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function plain(value) { return text(value).replace(/<sup[^>]*>(\d+)<\/sup>/gi, '($1)').replace(/<[^>]*>/g, ''); }
    function state(m) {
        var end = text(m.scores1 || m.scores), special = {Pst:'PST',Cnc:'CNC',Abn:'ABN',Int:'INT'};
        if (special[end]) return special[end];
        if (end) return /penalt|\bpen\b/i.test(end) ? 'PEN' : /\bOT\b|overtime|after et/i.test(end) ? 'OT' : 'FT';
        return m.live === true || m.live === 1 || m.live === '1' || m.live === 'True' ? 'LIVE' : '';
    }
    function merge(m, update) {
        var end = text(update.score_end), detail = text(update.additional_score_end);
        m.scores1 = end;
        m.scores = end ? end + (detail ? ' ' + detail : '') : detail;
        m.live_score = text(update.live_score); m.extra_score = text(update.extra_score); m.extra_info = text(update.extra_info);
        m.live = !m.scores && !!(m.live_score || m.extra_score || m.extra_info);
        m.update_score = Number(update.update_score) || 0;
        return m;
    }
    function eligible(entry) {
        if (!/^\d{1,12}$/.test(String(entry.id)) || entry.final) return false;
        var start = Number(entry.start), now = Date.now();
        return !start || (start <= now + 3600000 && start >= now - 172800000);
    }
    function plan(delay) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        if (!document.hidden && subscriptions.size && !running) timer = setTimeout(tick, delay);
    }
    async function tick() {
        timer = null;
        if (running || document.hidden) return;
        running = true;
        try {
            var groups = new Map();
            subscriptions.forEach(function(sub, owner) {
                if (owner.isConnected === false) { subscriptions.delete(owner); return; }
                var entries = sub.entries().filter(eligible);
                if (!entries.length) return;
                if (!groups.has(sub.url)) groups.set(sub.url, {ids:new Set(), targets:[]});
                var group = groups.get(sub.url);
                entries.forEach(function(e) { group.ids.add(String(e.id)); });
                group.targets.push({owner:owner, sub:sub});
            });
            for (var pair of groups) {
                var url = pair[0], group = pair[1], ids = Array.from(group.ids);
                for (var offset = 0; offset < ids.length && !document.hidden; offset += 100) {
                    controller = new AbortController();
                    var deadline = setTimeout(function() { if (controller) controller.abort(); }, 10000);
                    try {
                        var response = await fetch(url, {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'ids='+encodeURIComponent(ids.slice(offset, offset+100).join(',')),signal:controller.signal,cache:'no-store',credentials:'omit'});
                        if (!response.ok) throw new Error('Score service unavailable');
                        var updates = await response.json();
                        if (!Array.isArray(updates)) throw new Error('Invalid score response');
                        group.targets.forEach(function(target) {
                            if (!document.hidden && subscriptions.get(target.owner) === target.sub && target.owner.isConnected !== false) target.sub.apply(updates);
                        });
                    } catch (error) { /* Keep current scores and retry on the next cycle. */ }
                    finally { clearTimeout(deadline); controller = null; }
                }
            }
        } finally { running = false; plan(50000); }
    }
    function subscribe(owner, url, entries, apply) {
        var sub = {url:url,entries:entries,apply:apply};
        subscriptions.set(owner,sub); plan(500);
        return function() { if (subscriptions.get(owner) === sub) subscriptions.delete(owner); if (!subscriptions.size && timer !== null) {clearTimeout(timer);timer=null;} };
    }
    function patchRow(row, m) {
        var label = state(m), live = label === 'LIVE', score = live ? m.live_score : m.scores1;
        var detail = live ? [m.live_score,m.extra_score,m.extra_info].filter(Boolean).join(' ') : m.scores;
        var time = row.querySelector('.sp-col-time, .time-col'), target = row.querySelector('.sp-live-score-target');
        if (time) {
            if (row._kickoff === undefined) {
                var main = time.querySelector('.time-col-main');
                row._kickoff = main ? main.textContent : time.textContent;
                var date = time.querySelector('.time-col-sub:not(.is-live):not(.is-ft)');
                row._scoreDate = date && /\d{2}\/\d{2}/.test(date.textContent) ? date.textContent : '';
            }
            var html = '<div class="time-col-box">'+(row._scoreDate ? '<span class="time-col-sub">'+esc(row._scoreDate)+'</span>' : '')+'<span class="time-col-main'+(live?' is-live':'')+'">'+esc(row._kickoff)+'</span>'+(label?'<span class="time-col-sub '+(live?'is-live':'is-ft')+'">'+esc(label)+'</span>':'')+'</div>';
            if (time.innerHTML !== html) time.innerHTML = html;
        }
        if (target) {
            var html = label ? '<span class="sp-score-wrap" tabindex="0"><span class="sp-score-badge '+(live?'is-live sp-live-badge':'is-finished sp-score-finished')+'" title="'+esc(plain(detail))+'">'+esc(plain(score || label))+'</span><span class="sp-score-tooltip">'+esc(plain(detail))+'</span></span>' : '';
            if (target.innerHTML !== html) target.innerHTML = html;
        }
        row.classList.toggle('is-live-row',live); row.classList.toggle('is-finished-row',!!label && !live);
        var badge = row.querySelector('.sp-col-sp .sp-badge, .sp-col .sp-badge');
        if (badge) badge.classList.toggle('sp-badge-won', !!m.scores1 && m.scores1 === row.getAttribute('data-live-prediction'));
    }
    function watchRows(owner, url, afterUpdate) {
        var root = owner.shadowRoot || owner;
        return subscribe(owner,url,function() {
            return Array.from(root.querySelectorAll('[data-live-id]')).map(function(row) {
                return {id:row.getAttribute('data-live-id'),start:row.getAttribute('data-live-start'),final:row.getAttribute('data-live-final') === '1'};
            });
        },function(updates) {
            var byId = new Map(updates.map(function(u) {return [String(u.event_id),u];}));
            root.querySelectorAll('[data-live-id]').forEach(function(row) {
                var update = byId.get(row.getAttribute('data-live-id'));
                if (!update) return;
                var m = merge({},update); patchRow(row,m);
                if (afterUpdate) afterUpdate(row);
                row.setAttribute('data-live-final', /^(FT|OT|PEN|CNC|ABN)$/.test(state(m)) ? '1' : '0');
            });
        });
    }
    document.addEventListener('visibilitychange',function() {
        if (document.hidden) {if (timer !== null) clearTimeout(timer);timer=null;if(controller) controller.abort();}
        else plan(500);
    });
    w.SportsLiveScores = {subscribe:subscribe,watchRows:watchRows,merge:merge,state:state,eligible:eligible};
})(window);



/**
 * Standalone Universal Sports & Match Schedule Widget
 * Embedded on any site (Wix, Webflow, Blogger, WordPress, HTML)
 * Modeled after tvevents.org with Sport Tabs, Horizontal Scroll, Sub-menu & Date Slider
 */
(function () {
    "use strict";

    var baseUrl = 'https://tvevents.org/widget/';
    var defaultProxy = baseUrl + 'schedule_proxy.php';

    // Full catalog of 27 sports matching tvevents.org & sportposter
    var sportsList = [
        // Primary sports visible directly in scroll bar
        { id: 'soccer', num: 4, name: 'Football', icon: '⚽', isPrimary: true },
        { id: 'basketball', num: 2, name: 'Basketball', icon: '🏀', isPrimary: true },
        { id: 'hockey', num: 3, name: 'Hockey', icon: '🏒', isPrimary: true },
        { id: 'tennis', num: 5, name: 'Tennis', icon: '🎾', isPrimary: true },
        { id: 'handball', num: 19, name: 'Handball', icon: '🤾', isPrimary: true },
        { id: 'baseball', num: 1, name: 'Baseball', icon: '⚾', isPrimary: true },
        { id: 'volleyball', num: 6, name: 'Volleyball', icon: '🏐', isPrimary: true },
        { id: 'table-tennis', num: 47, name: 'Table Tennis', icon: '🏓', isPrimary: true },
        { id: 'darts', num: 39, name: 'Darts', icon: '🎯', isPrimary: true },
        { id: 'badminton', num: 40, name: 'Badminton', icon: '🏸', isPrimary: true },
        { id: 'american-football', num: 7, name: 'Am. Football', icon: '🏈', isPrimary: true },
        { id: 'futsal', num: 31, name: 'Futsal', icon: '⚽', isPrimary: true },
        { id: 'esports', num: 42, name: 'eSports', icon: '🎮', isPrimary: true },
        // Secondary sports available in More Sports menu
        { id: 'boxing', num: 24, name: 'Boxing', icon: '🥊', isPrimary: false },
        { id: 'mma', num: 43, name: 'MMA', icon: '🥊', isPrimary: false },
        { id: 'snooker', num: 10, name: 'Snooker', icon: '🎱', isPrimary: false },
        { id: 'cricket', num: 12, name: 'Cricket', icon: '🏏', isPrimary: false },
        { id: 'rugby-union', num: 9, name: 'Rugby Union', icon: '🏉', isPrimary: false },
        { id: 'rugby-league', num: 8, name: 'Rugby League', icon: '🏉', isPrimary: false },
        { id: 'floorball', num: 38, name: 'Floorball', icon: '🏑', isPrimary: false },
        { id: 'water-polo', num: 33, name: 'Water Polo', icon: '🤽', isPrimary: false },
        { id: 'bandy', num: 30, name: 'Bandy', icon: '🏑', isPrimary: false },
        { id: 'beach-soccer', num: 41, name: 'Beach Soccer', icon: '⚽', isPrimary: false },
        { id: 'australian-football', num: 16, name: 'Australian Football', icon: '🏉', isPrimary: false },
        { id: 'canadian-football', num: 13, name: 'Canadian Football', icon: '🏈', isPrimary: false },
        { id: 'arena-football', num: 14, name: 'Arena Football', icon: '🏈', isPrimary: false },
        { id: 'pesapallo', num: 37, name: 'Pesapallo', icon: '⚾', isPrimary: false }
    ];

    var sportTypeMap = {
        1: 'Baseball', 2: 'Basketball', 3: 'Hockey', 4: 'Soccer',
        5: 'Tennis', 6: 'Volleyball', 7: 'American-Football', 8: 'Rugby-League',
        9: 'Rugby-Union', 10: 'Snooker', 12: 'Cricket', 13: 'Canadian-Football',
        14: 'Arena-Football', 16: 'Australian-Football', 19: 'Handball', 24: 'Boxing',
        30: 'Bandy', 31: 'Futsal', 33: 'Water-Polo', 37: 'Pesapallo',
        38: 'Floorball', 39: 'Darts', 40: 'Badminton', 41: 'Beach-Soccer',
        42: 'eSports', 43: 'MMA', 47: 'Table-Tennis'
    };

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function isHttpUrl(str) {
        return typeof str === 'string' && (str.indexOf('http://') === 0 || str.indexOf('https://') === 0);
    }

    function ucwords(str) {
        return (str + '').replace(/^([a-z])|\s+([a-z])/g, function ($1) {
            return $1.toUpperCase();
        });
    }

    /**
     * Determines America/New_York UTC offset in minutes for date d.
     * EDT = UTC-4 (-240m), EST = UTC-5 (-300m)
     */
    function getNYOffsetMinutes(d) {
        try {
            var str = d.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' });
            if (str.indexOf('EDT') !== -1) return -240;
            if (str.indexOf('EST') !== -1) return -300;
        } catch (e) {}

        var year = d.getFullYear();
        var marchFirst = new Date(year, 2, 1);
        var marchSecondSunday = 1 + ((7 - marchFirst.getDay()) % 7) + 7;
        var dstStart = new Date(year, 2, marchSecondSunday, 2, 0, 0);

        var novFirst = new Date(year, 10, 1);
        var novFirstSunday = 1 + ((7 - novFirst.getDay()) % 7);
        var dstEnd = new Date(year, 10, novFirstSunday, 2, 0, 0);

        if (d >= dstStart && d < dstEnd) {
            return -240;
        }
        return -300;
    }

    /**
     * Converts match start time (which is stored in America/New_York in sportposter)
     * to the user's browser local timezone.
     */
    function parseNYTimeToLocal(dateStr) {
        if (!dateStr) return null;
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;

        var nyOffset = getNYOffsetMinutes(d);
        var browserOffset = -d.getTimezoneOffset(); // in minutes from UTC
        var diffMinutes = browserOffset - nyOffset;

        return new Date(d.getTime() + diffMinutes * 60 * 1000);
    }

    function formatTime(dateStr) {
        var localDate = parseNYTimeToLocal(dateStr);
        if (!localDate) return dateStr || '';
        var hh = ('0' + localDate.getHours()).slice(-2);
        var mm = ('0' + localDate.getMinutes()).slice(-2);
        return hh + ':' + mm;
    }

    /**
     * Cleans scores across all sports (Darts, Tennis, etc.):
     * - Strips HTML tags (<strong>, <span>, <sup>)
     * - Converts tiebreak <sup>5</sup> to (5)
     * - Decodes HTML entities (&nbsp;, &amp;)
     * - Removes redundant Darts text like "(Final result ... played on legs)"
     */
    function cleanScore(rawScore, scores1, sportId) {
        if (!rawScore && !scores1) return '';
        var s = String(rawScore || scores1 || '');

        // In Darts or when scores contains "played on legs" / "Final result"
        if (sportId === 39 || s.indexOf('played on legs') !== -1 || s.indexOf('Final result') !== -1) {
            if (scores1 && String(scores1).trim() !== '') {
                return String(scores1).trim();
            }
            s = s.replace(/\s*\(\s*Final\s*result.*?played\s*on\s*legs\s*\)/gi, '');
            s = s.replace(/\s*\(\s*Final\s*result\s*only\s*\)/gi, '');
        }

        // 1. Decode entities
        s = s.replace(/&nbsp;/gi, ' ')
             .replace(/&amp;/gi, '&')
             .replace(/&lt;/gi, '<')
             .replace(/&gt;/gi, '>')
             .replace(/&quot;/gi, '"')
             .replace(/&#039;/gi, "'");

        // 2. Convert tiebreaks: <sup>5</sup> to (5)
        s = s.replace(/<sup[^>]*>(.*?)<\/sup>/gi, '($1)');

        // 3. Strip all HTML tags
        s = s.replace(/<[^>]+>/g, '');

        // 4. Normalize spaces
        s = s.replace(/\s{2,}/g, ' ').trim();
        return s;
    }

    /**
     * Converts sportposter live extra_info into clean match period / time (like tvevents.org):
     * e.g. "2nd Half - 58'" -> "2H 58'", "Half-time" -> "HT", "1st Period" -> "P1", "1st Inning" -> "I1"
     */
    function formatLiveTime(extraInfo) {
        if (!extraInfo) return '';
        var s = String(extraInfo);

        s = s.replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '').trim();

        s = s.replace(/1st Period/gi, "P1");
        s = s.replace(/2nd Period/gi, "P2");
        s = s.replace(/3rd Period/gi, "P3");
        s = s.replace(/1st Inning/gi, "I1");
        s = s.replace(/2nd Inning/gi, "I2");
        s = s.replace(/3rd Inning/gi, "I3");
        s = s.replace(/4th Inning/gi, "I4");
        s = s.replace(/5th Inning/gi, "I5");
        s = s.replace(/6th Inning/gi, "I6");
        s = s.replace(/7th Inning/gi, "I7");
        s = s.replace(/8th Inning/gi, "I8");
        s = s.replace(/9th Inning/gi, "I9");
        s = s.replace(/1st Quarter/gi, "Q1");
        s = s.replace(/2nd Quarter/gi, "Q2");
        s = s.replace(/3rd Quarter/gi, "Q3");
        s = s.replace(/4th Quarter/gi, "Q4");
        s = s.replace(/1st Half/gi, "1H");
        s = s.replace(/2nd Half/gi, "2H");
        s = s.replace(/Penalties/gi, "Pen");
        s = s.replace(/Extra Time/gi, "ET");
        s = s.replace(/Half-time/gi, "HT");
        s = s.replace(/Pending/gi, "•");

        s = s.replace(/\s*-\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
        return s;
    }

    function formatDropVal(initVal, currVal) {
        var init = parseFloat(initVal);
        var curr = parseFloat(currVal);
        if (!init || !curr || init <= 0 || curr <= 0) return '';
        var diff = curr - init;
        var pctNum = diff >= 0 ? ((diff / curr) * 100) : ((diff / init) * 100);
        var pctStr = (diff >= 0 ? '+' : '') + pctNum.toFixed(1) + '%';
        var color = '#475569';
        var bg = '#f8fafc';
        var border = '#e2e8f0';
        if (diff >= 0) {
            if (pctNum >= 20) { color = '#1d4ed8'; bg = '#eff6ff'; border = '#bfdbfe'; }
            else if (pctNum >= 10) { color = '#0284c7'; bg = '#f0f9ff'; border = '#bae6fd'; }
        } else {
            if (pctNum <= -20) { color = '#dc2626'; bg = '#fef2f2'; border = '#fecaca'; }
            else if (pctNum <= -10) { color = '#d97706'; bg = '#fffbeb'; border = '#fde68a'; }
        }
        return "<span class='sp-badge' style='color:" + color + ";background:" + bg + ";border-color:" + border + ";min-width:44px;'>" + pctStr + "</span>";
    }

    function formatOddsBadge(val, link, fallbackHref) {
        if (!val || val === '') return '';
        var validUrl = isHttpUrl(link) ? link : (isHttpUrl(fallbackHref) ? fallbackHref : '');
        if (validUrl) {
            return "<a href='" + encodeURI(validUrl) + "' class='sp-badge sp-badge-odds' target='_blank' rel='nofollow'>" + escapeHtml(val) + "</a>";
        }
        return "<span class='sp-badge sp-badge-odds'>" + escapeHtml(val) + "</span>";
    }

    function formatBmBadge(label, link, fallbackHref) {
        var validUrl = isHttpUrl(link) ? link : (isHttpUrl(fallbackHref) ? fallbackHref : '');
        if (validUrl) {
            return '<a href="' + encodeURI(validUrl) + '" target="_blank" rel="nofollow" class="sp-badge sp-badge-bm">' + escapeHtml(label) + '</a>';
        }
        return '<span class="sp-badge sp-badge-bm">' + escapeHtml(label) + '</span>';
    }

    function formatSPBadge(sp, isWon) {
        if (!sp || sp === '') return "<span class='sp-badge sp-badge-empty'>&mdash;</span>";
        var extraClass = isWon ? ' sp-badge-won' : '';
        return "<span class='sp-badge sp-badge-sp" + extraClass + "'>" + escapeHtml(sp) + "</span>";
    }

    function formatEmptyBadge(w) {
        var minW = w || 40;
        return "<span class='sp-badge sp-badge-empty' style='min-width:" + minW + "px;'>&mdash;</span>";
    }

    /**
     * Renders TV Broadcast channels icon & tooltip (modeled after live2sport.com)
     * Strictly uses val.field_tv_channel (no bookmaker streaming links)
     */
    function formatTvChannels(tvField) {
        if (!tvField || typeof tvField !== 'string') return '';
        var raw = tvField.trim();
        if (!raw) return '';

        // Clean entities and html tags
        raw = raw.replace(/&nbsp;/gi, ' ')
                 .replace(/&amp;/gi, '&')
                 .replace(/<[^>]+>/g, '');

        var parts = raw.split(/,\s*/);
        var channels = [];
        var seen = {};

        for (var i = 0; i < parts.length; i++) {
            var ch = parts[i].trim();
            if (ch && !seen[ch.toLowerCase()]) {
                seen[ch.toLowerCase()] = true;
                channels.push(ch);
            }
        }

        if (channels.length === 0) return '';

        var count = channels.length;
        var styleCount = (count >= 10) ? ' style="font-size:9.5px;letter-spacing:-0.5px;"' : '';

        var listHtml = '';
        for (var j = 0; j < channels.length; j++) {
            listHtml += '<div class="sp-tv-channel-line">' + escapeHtml(channels[j]) + '</div>';
        }

        var imgUrl = baseUrl + 'images/ico_tv.png';

        return '<span class="sp-tv-wrap" tabindex="0" title="' + count + ' TV Channels">' +
            '<span class="sp-tv-icon-box">' +
                '<img src="' + imgUrl + '" alt="TV" class="sp-tv-img" onerror="this.style.display=\'none\';this.nextElementSibling.classList.add(\'sp-tv-badge-fallback\');">' +
                '<span class="sp-tv-overlay"' + styleCount + '>' + count + '</span>' +
            '</span>' +
            '<span class="sp-tv-tooltip">' +
                '<span class="sp-tv-tooltip-header">📺 TV Channels (' + count + ')</span>' +
                '<span class="sp-tv-tooltip-list">' + listHtml + '</span>' +
            '</span>' +
        '</span>';
    }

    function hasMatchPrediction(val) {
        if (!val) return false;
        var u = parseFloat(val.count_users_predictions || 0);
        if (u > 0) return true;
        var op = val.oddsportal_prediction;
        if (op && op.length > 0 && String(op[0]).trim() !== '') return true;
        var op_roi = val.oddsportal_prediction_best_roi_users;
        if (op_roi && op_roi.length > 0 && String(op_roi[0]).trim() !== '') return true;
        return false;
    }

    /**
     * Prediction / Recommended Bets icon & tooltip cell
     */
    function formatTipCell(val, baseUrl, matchHref, matchLinks) {
        if (!hasMatchPrediction(val)) {
            return '';
        }

        var eid = val.event_id || val.first_event_team_to_team || '';
        var h2h = val.first_event_team_to_team || '';
        if (!eid) return '';

        var icoUrl = baseUrl + 'images/ico_prediction.png';
        var homeTeam = escapeHtml(val.team_home_full || val.team_home || 'Home');
        var awayTeam = escapeHtml(val.team_away_full || val.team_away || 'Away');
        var userVotes = parseFloat(val.count_users_predictions || 0);

        var tipButton = matchLinks
            ? '<a href="' + escapeHtml(matchHref) + '" target="_blank" class="sp-tip-btn" title="Predictions & Tips">'
            : '<span class="sp-tip-btn" title="Predictions & Tips">';
        var tipButtonEnd = matchLinks ? '</a>' : '</span>';

        return '<span class="sp-tip-wrap" data-eid="' + eid + '" data-h2h="' + h2h + '" data-users="' + userVotes + '" data-home="' + homeTeam + '" data-away="' + awayTeam + '" data-href="' + escapeHtml(matchLinks ? matchHref : '') + '" tabindex="0">' +
            tipButton +
                '<img src="' + icoUrl + '" alt="Tip" class="sp-tip-ico" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\';">' +
                '<span class="sp-tip-fallback" style="display:none;">🎯</span>' +
            tipButtonEnd +
            '<span class="sp-tip-tooltip" id="sp-tip-' + eid + '">' +
                '<span class="sp-tip-header"><span class="sp-tip-title">🎯 Predictions & Community Tips</span></span>' +
                '<span class="sp-tip-body">' +
                    '<span class="sp-tip-loading"><span class="sp-tip-spinner"></span> Loading prediction...</span>' +
                '</span>' +
            '</span>' +
        '</span>';
    }

    /**
     * Resolves complete, clean match title from event / event_full / team_home / team_away
     * Handles cases like "Gangwon - ", "- Kitchee", "- Shanghai Shenhua", "-"
     */
    function getMatchTitle(val) {
        if (!val) return 'Match';
        var ev = (val.event || '').trim();
        var evFull = (val.event_full || '').trim();
        var home = (val.team_home || '').trim();
        var away = (val.team_away || '').trim();

        var isEvValid = false;
        if (ev && ev !== '-') {
            var parts = ev.split(/\s+-\s+/);
            if (parts.length >= 2 && parts[0].trim().length > 0 && parts[1].trim().length > 0) {
                isEvValid = true;
            } else {
                var hParts = ev.split('-');
                if (hParts.length >= 2 && hParts[0].trim().length > 0 && hParts[hParts.length - 1].trim().length > 0) {
                    isEvValid = true;
                }
            }
        }

        var title = '';
        if (isEvValid) {
            title = ev;
        } else if (evFull && evFull !== '-') {
            title = evFull;
        } else if (home && away) {
            title = home + ' - ' + away;
        } else if (evFull) {
            title = evFull;
        } else if (home || away) {
            title = home || away;
        } else {
            title = ev || 'Match';
        }

        title = title.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '').trim();
        return title || 'Match';
    }

    function injectStyles() {
        if (document.getElementById('sp-widget-embedded-styles')) return;
        var style = document.createElement('style');
        style.id = 'sp-widget-embedded-styles';
        style.textContent = `
            .sp-widget-root {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #0f172a;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
                overflow: hidden;
                margin: 20px 0;
                box-sizing: border-box;
                position: relative;
            }
            .sp-widget-root * {
                box-sizing: border-box;
            }
            /* Sports Navigation Bar with Arrows & Dropdown */
            .sp-nav-sports-container {
                display: flex;
                align-items: center;
                background: #0f172a;
                padding: 6px 8px;
                position: relative;
                gap: 6px;
            }
            .sp-nav-arrow {
                background: rgba(255, 255, 255, 0.12);
                color: #ffffff;
                border: none;
                width: 28px;
                height: 32px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                font-weight: bold;
                flex-shrink: 0;
                transition: background 0.15s ease;
                user-select: none;
            }
            .sp-nav-arrow:hover {
                background: rgba(255, 255, 255, 0.25);
            }
            .sp-nav-sports-scroll {
                display: flex;
                flex-direction: row;
                flex-wrap: nowrap;
                overflow-x: auto;
                scroll-behavior: smooth;
                gap: 6px;
                flex: 1 1 auto;
                padding: 2px 0;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
            }
            .sp-nav-sports-scroll::-webkit-scrollbar {
                display: none;
            }
            .sp-sport-btn {
                flex: 0 0 auto;
                background: rgba(255, 255, 255, 0.08);
                color: #e2e8f0;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 20px;
                padding: 5px 12px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }
            .sp-sport-btn:hover {
                background: rgba(255, 255, 255, 0.18);
                color: #ffffff;
            }
            .sp-sport-btn.active {
                background: #2563eb;
                color: #ffffff;
                border-color: #3b82f6;
                box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
            }
            /* More Sports Dropdown */
            .sp-more-dropdown-wrap {
                position: relative;
                flex-shrink: 0;
            }
            .sp-more-btn {
                background: rgba(255, 255, 255, 0.1);
                color: #e2e8f0;
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 20px;
                padding: 5px 12px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                white-space: nowrap;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s ease;
            }
            .sp-more-btn:hover, .sp-more-btn.active {
                background: #2563eb;
                color: #ffffff;
                border-color: #3b82f6;
            }
            .sp-more-menu {
                display: none;
                position: absolute;
                top: calc(100% + 6px);
                right: 0;
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
                z-index: 1000;
                min-width: 190px;
                max-height: 360px;
                overflow-y: auto;
                padding: 4px 0;
                scrollbar-width: thin;
                scrollbar-color: #475569 #1e293b;
            }
            .sp-more-menu::-webkit-scrollbar {
                width: 6px;
            }
            .sp-more-menu::-webkit-scrollbar-thumb {
                background: #475569;
                border-radius: 4px;
            }
            .sp-more-menu.open {
                display: block;
            }
            .sp-more-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 7px 14px;
                color: #e2e8f0;
                font-size: 13px;
                cursor: pointer;
                transition: background 0.15s ease;
                border: none;
                background: transparent;
                width: 100%;
                text-align: left;
            }
            .sp-more-item:hover {
                background: #334155;
                color: #ffffff;
            }
            .sp-more-item.active {
                background: #2563eb;
                color: #ffffff;
                font-weight: 600;
            }
            /* Date Selector Strip */
            .sp-date-strip {
                display: flex;
                flex-direction: row;
                flex-wrap: nowrap;
                overflow-x: auto;
                background: #f8fafc;
                border-bottom: 1px solid #e2e8f0;
                padding: 8px 12px;
                gap: 6px;
                -webkit-overflow-scrolling: touch;
            }
            .sp-date-strip::-webkit-scrollbar {
                height: 4px;
            }
            .sp-date-strip::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 4px;
            }
            .sp-date-item {
                flex: 0 0 auto;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 6px 12px;
                border-radius: 8px;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                color: #334155;
                cursor: pointer;
                text-decoration: none;
                transition: all 0.15s ease;
                min-width: 72px;
                line-height: 1.2;
            }
            .sp-date-item:hover {
                border-color: #2563eb;
                background: #ffffff;
                transform: translateY(-1px);
            }
            .sp-date-item.active {
                background: #2563eb !important;
                color: #ffffff !important;
                border-color: #2563eb !important;
                box-shadow: 0 3px 10px rgba(37, 99, 235, 0.3);
            }
            .sp-date-item .sp-day-label {
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 2px;
                opacity: 0.85;
                font-weight: 600;
            }
            .sp-date-item .sp-date-label {
                font-size: 13px;
                font-weight: 700;
            }
            /* Matches Table */
            .sp-table-wrap {
                overflow-x: auto;
                width: 100%;
            }
            .sp-table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
            }
            .sp-league-header {
                background: #f1f5f9;
                border-top: 1px solid #e2e8f0;
                border-bottom: 1px solid #e2e8f0;
            }
            .sp-league-header td {
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 700;
                color: #334155;
            }
            .sp-league-header a {
                color: #0f172a;
                text-decoration: none;
            }
            .sp-league-header a:hover {
                text-decoration: underline;
                color: #2563eb;
            }
            .sp-match-row {
                border-bottom: 1px solid #f1f5f9;
                transition: background 0.15s ease;
            }
            .sp-match-row:hover {
                background: #f8fafc;
            }
            .sp-match-row td {
                padding: 8px 10px;
                vertical-align: middle;
                font-size: 13px;
            }
            .sp-col-time {
                width: 68px;
                color: #64748b;
                font-size: 12px;
                font-weight: 600;
                text-align: center;
                white-space: nowrap;
            }
            .sp-col-time-live {
                color: #dc2626 !important;
                font-weight: 700;
                display: inline-block;
            }
            .sp-col-event {
                width: auto;
            }
            .sp-col-tv {
                width: 38px;
                text-align: center;
                vertical-align: middle;
                padding: 0 4px !important;
                line-height: 1;
            }
            .sp-col-tip {
                width: 38px;
                text-align: center;
                vertical-align: middle;
                padding: 0 4px !important;
                line-height: 1;
            }
            .sp-event-link {
                color: #0f172a;
                text-decoration: none;
                font-weight: 600;
                font-size: 13px;
            }
            .sp-event-link:hover {
                color: #2563eb;
                text-decoration: underline;
            }
            .sp-col-trend {
                width: 160px;
                font-size: 11px;
                color: #475569;
                white-space: nowrap;
            }
            .sp-col-odds {
                width: 155px;
                white-space: nowrap;
            }
            .sp-col-sp {
                width: 65px;
                text-align: center;
            }
            .sp-badge {
                display: inline-block;
                padding: 2px 4px;
                margin: 0 2px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                text-align: center;
                box-sizing: border-box;
                line-height: 18px;
                border: 1px solid transparent;
            }
            .sp-badge-odds {
                background: #f1f5f9;
                border-color: #cbd5e1;
                color: #0f172a;
                min-width: 40px;
                text-decoration: none;
            }
            a.sp-badge-odds:hover {
                background: #2563eb;
                border-color: #2563eb;
                color: #ffffff;
            }
            .sp-badge-bm {
                background: #e2e8f0;
                border-color: #cbd5e1;
                color: #1e293b;
                min-width: 34px;
                text-decoration: none;
            }
            a.sp-badge-bm:hover {
                background: #2563eb;
                color: #ffffff;
                border-color: #2563eb;
            }
            .sp-badge-sp {
                background: #f1f5f9;
                border-color: #cbd5e1;
                color: #334155;
                min-width: 42px;
            }
            .sp-badge-won {
                background: #dcfce7 !important;
                border-color: #86efac !important;
                color: #15803d !important;
            }
            .sp-badge-empty {
                background: #f8fafc;
                border: 1px dashed #cbd5e1;
                color: #94a3b8;
            }
            /* Finished match scores: GREEN */
            .sp-score-finished {
                display: inline-block;
                margin-left: 6px;
                font-size: 12px;
                font-weight: 700;
                color: #16a34a !important;
            }
            .sp-score-badge {
                display: inline-block;
                margin-left: 6px;
                font-size: 12px;
                font-weight: 700;
                color: #16a34a !important;
            }
            /* Live matches: RED with elapsed time */
            .sp-live-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-left: 6px;
                color: #dc2626 !important;
                font-weight: 700;
                font-size: 12px;
                text-decoration: none;
            }
            .sp-live-num {
                color: #dc2626;
                font-weight: 800;
            }
            .sp-live-time {
                color: #dc2626;
                font-weight: 700;
            }
            /* TV Broadcasts & Channels Tooltip (Modeled after live2sport.com) */
            .sp-tv-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                vertical-align: middle;
                margin: 0 auto;
                cursor: pointer;
                line-height: 1;
                user-select: none;
            }
            .sp-tv-icon-box {
                position: relative;
                display: block;
                width: 26px;
                height: 26px;
                line-height: 1;
            }
            .sp-tv-img {
                width: 26px !important;
                height: 26px !important;
                display: block;
                border: none;
                margin: 0 auto;
            }
            .sp-tv-overlay {
                position: absolute;
                top: 10px;
                left: 1px;
                width: 18px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                color: #000000;
                font-size: 11px;
                font-weight: 800;
                line-height: 1;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                pointer-events: none;
            }
            .sp-tv-overlay.sp-tv-badge-fallback {
                position: static;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: #f1f5f9;
                color: #1e293b;
                border: 1px solid #cbd5e1;
                border-radius: 4px;
                padding: 1px 4px;
                font-size: 10px;
                font-weight: 700;
                width: auto;
                height: auto;
            }
            .sp-tv-overlay.sp-tv-badge-fallback::before {
                content: "📺 ";
                margin-right: 2px;
            }
            .sp-tv-tooltip {
                visibility: hidden;
                opacity: 0;
                position: absolute;
                top: calc(100% + 5px);
                left: 50%;
                transform: translateX(-50%);
                background: #0f172a;
                color: #f8fafc;
                border: 1px solid #334155;
                border-radius: 8px;
                padding: 8px 10px;
                font-size: 11px;
                line-height: 1.45;
                white-space: nowrap;
                max-height: 200px;
                min-width: 140px;
                overflow-y: auto;
                z-index: 9999;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
                transition: opacity 0.15s ease, visibility 0.15s ease;
                pointer-events: auto;
                text-align: left;
                scrollbar-width: thin;
                scrollbar-color: #475569 transparent;
            }
            .sp-tv-tooltip::-webkit-scrollbar {
                width: 4px;
            }
            .sp-tv-tooltip::-webkit-scrollbar-thumb {
                background: #475569;
                border-radius: 2px;
            }
            .sp-tv-tooltip::before {
                content: "";
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                border-width: 5px;
                border-style: solid;
                border-color: transparent transparent #0f172a transparent;
            }
            .sp-tv-tooltip::after {
                content: "";
                position: absolute;
                bottom: 100%;
                left: 0;
                width: 100%;
                height: 8px;
            }
            .sp-match-row:nth-last-child(-n+2) .sp-tv-tooltip {
                top: auto;
                bottom: calc(100% + 5px);
            }
            .sp-match-row:nth-last-child(-n+2) .sp-tv-tooltip::before {
                bottom: auto;
                top: 100%;
                border-color: #0f172a transparent transparent transparent;
            }
            .sp-match-row:nth-last-child(-n+2) .sp-tv-tooltip::after {
                bottom: auto;
                top: 100%;
            }
            .sp-tv-wrap:hover .sp-tv-tooltip,
            .sp-tv-wrap:focus .sp-tv-tooltip,
            .sp-tv-wrap:focus-within .sp-tv-tooltip {
                visibility: visible;
                opacity: 1;
            }
            .sp-tv-tooltip-header {
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 700;
                color: #38bdf8;
                font-size: 10px;
                letter-spacing: 0.3px;
                text-transform: uppercase;
                margin-bottom: 5px;
                padding-bottom: 4px;
                border-bottom: 1px solid #1e293b;
            }
            .sp-tv-channel-line {
                padding: 1px 0;
                color: #e2e8f0;
                font-weight: 500;
            }
            .sp-tv-channel-line:hover {
                color: #ffffff;
            }
            /* Prediction / Recommended Bets Tooltip */
            .sp-tip-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .sp-tip-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 26px;
                height: 26px;
                border-radius: 6px;
                background: #f1f5f9;
                border: 1px solid #cbd5e1;
                cursor: pointer;
                text-decoration: none;
                transition: all 0.15s ease;
                box-sizing: border-box;
            }
            .sp-tip-btn:hover {
                background: #e0f2fe;
                border-color: #0284c7;
                transform: scale(1.08);
            }
            .sp-tip-ico {
                height: 20px;
                width: auto;
                display: block;
            }
            .sp-tip-fallback {
                font-size: 14px;
                line-height: 1;
            }
            .sp-tip-tooltip {
                visibility: hidden;
                opacity: 0;
                position: absolute;
                top: calc(100% + 5px);
                left: 50%;
                transform: translateX(-50%);
                background: #0f172a;
                color: #f8fafc;
                border: 1px solid #334155;
                border-radius: 8px;
                padding: 10px 12px;
                font-size: 11px;
                line-height: 1.45;
                min-width: 250px;
                max-width: 320px;
                z-index: 9999;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
                transition: opacity 0.15s ease, visibility 0.15s ease;
                pointer-events: auto;
                text-align: left;
                scrollbar-width: thin;
                scrollbar-color: #475569 transparent;
                box-sizing: border-box;
            }
            .sp-tip-tooltip::before {
                content: "";
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                border-width: 5px;
                border-style: solid;
                border-color: transparent transparent #0f172a transparent;
            }
            .sp-tip-tooltip::after {
                content: "";
                position: absolute;
                bottom: 100%;
                left: 0;
                width: 100%;
                height: 8px;
            }
            .sp-match-row:nth-last-child(-n+2) .sp-tip-tooltip {
                top: auto;
                bottom: calc(100% + 5px);
            }
            .sp-match-row:nth-last-child(-n+2) .sp-tip-tooltip::before {
                bottom: auto;
                top: 100%;
                border-color: #0f172a transparent transparent transparent;
            }
            .sp-match-row:nth-last-child(-n+2) .sp-tip-tooltip::after {
                bottom: auto;
                top: 100%;
            }
            .sp-tip-wrap:hover .sp-tip-tooltip,
            .sp-tip-wrap:focus .sp-tip-tooltip,
            .sp-tip-wrap:focus-within .sp-tip-tooltip {
                visibility: visible;
                opacity: 1;
            }
            .sp-tip-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-weight: 700;
                color: #38bdf8;
                font-size: 11px;
                letter-spacing: 0.3px;
                margin-bottom: 7px;
                padding-bottom: 5px;
                border-bottom: 1px solid #1e293b;
            }
            .sp-tip-sec-block {
                margin-bottom: 7px;
                padding-bottom: 6px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            .sp-tip-sec-block:last-child {
                margin-bottom: 4px;
                padding-bottom: 0;
                border-bottom: none;
            }
            .sp-tip-sec-badge {
                display: inline-block;
                font-size: 10px;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 4px;
                margin-bottom: 3px;
                letter-spacing: 0.2px;
                background: rgba(148, 163, 184, 0.15);
                color: #cbd5e1;
            }
            .sp-tip-sec-users {
                background: rgba(34, 197, 94, 0.18);
                color: #4ade80;
                border: 1px solid rgba(34, 197, 94, 0.3);
            }
            .sp-tip-sec-experts {
                background: rgba(14, 165, 233, 0.18);
                color: #38bdf8;
                border: 1px solid rgba(14, 165, 233, 0.3);
            }
            .sp-tip-sec-consensus {
                background: rgba(234, 179, 8, 0.18);
                color: #fde047;
                border: 1px solid rgba(234, 179, 8, 0.3);
            }
            .sp-tip-sec-body {
                font-size: 11px;
                line-height: 1.45;
                color: #e2e8f0;
            }
            .sp-tip-bets-header {
                font-size: 10px;
                font-weight: 700;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                margin: 6px 0 4px;
            }
            .sp-tip-item {
                background: rgba(30, 41, 59, 0.7);
                border: 1px solid #334155;
                border-radius: 6px;
                padding: 5px 7px;
                margin-bottom: 4px;
            }
            .sp-tip-item-main {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 5px;
                font-size: 11px;
            }
            .sp-tip-mkt {
                display: inline-block;
                background: #0284c7;
                color: #ffffff;
                font-size: 9.5px;
                font-weight: 700;
                padding: 1px 5px;
                border-radius: 4px;
                letter-spacing: 0.3px;
            }
            .sp-tip-pick {
                color: #f1f5f9;
                font-weight: 600;
            }
            .sp-tip-odds {
                color: #4ade80;
                font-weight: 700;
            }
            .sp-tip-votes {
                color: #94a3b8;
                font-size: 10px;
            }
            .sp-tip-star {
                display: inline-block;
                background: #854d0e;
                color: #fef08a;
                font-size: 9.5px;
                font-weight: 700;
                padding: 1px 5px;
                border-radius: 4px;
            }

            .sp-tip-full-link {
                display: block;
                margin-top: 6px;
                padding: 4px 6px;
                background: #1e293b;
                color: #38bdf8;
                text-decoration: none;
                border-radius: 4px;
                text-align: center;
                font-weight: 600;
                font-size: 10.5px;
                transition: background 0.15s;
            }
            .sp-tip-full-link:hover {
                background: #0284c7;
                color: #ffffff;
            }
            .sp-tip-loading {
                padding: 8px 0;
                text-align: center;
                color: #94a3b8;
                font-size: 11px;
            }
            .sp-tip-spinner {
                display: inline-block;
                width: 10px;
                height: 10px;
                border: 2px solid #38bdf8;
                border-top-color: transparent;
                border-radius: 50%;
                animation: sp-spin 0.6s linear infinite;
                margin-right: 4px;
                vertical-align: middle;
            }
            .sp-loading-box {
                padding: 40px;
                text-align: center;
                color: #64748b;
                font-size: 14px;
            }
            .sp-empty-box {
                padding: 40px;
                text-align: center;
                color: #94a3b8;
                font-size: 14px;
            }
            .sp-spinner {
                display: inline-block;
                width: 24px;
                height: 24px;
                border: 3px solid #e2e8f0;
                border-top-color: #2563eb;
                border-radius: 50%;
                animation: sp-spin 0.8s linear infinite;
                margin-bottom: 8px;
            }
            @keyframes sp-spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    function getTodayDateStr() {
        var d = new Date();
        var yyyy = d.getFullYear();
        var mm = ('0' + (d.getMonth() + 1)).slice(-2);
        var dd = ('0' + d.getDate()).slice(-2);
        return yyyy + '-' + mm + '-' + dd;
    }

    function generateDates() {
        var dates = [];
        var now = new Date();
        for (var i = -1; i <= 7; i++) {
            var d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
            var yyyy = d.getFullYear();
            var mm = ('0' + (d.getMonth() + 1)).slice(-2);
            var dd = ('0' + d.getDate()).slice(-2);
            var dateStr = yyyy + '-' + mm + '-' + dd;

            var subLabel = '';
            if (i === -1) subLabel = 'Yesterday';
            else if (i === 0) subLabel = 'Today';
            else if (i === 1) subLabel = 'Tomorrow';
            else {
                var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                subLabel = days[d.getDay()];
            }

            dates.push({
                dateStr: dateStr,
                subLabel: subLabel,
                dateLabel: dd + '/' + mm,
                isToday: (i === 0)
            });
        }
        return dates;
    }

    function SportsWidget(container, options) {
        this.container = container;
        this.options = options || {};
        this.proxyUrl = this.options.proxyUrl || defaultProxy;
        this.siteUrl = this.options.siteUrl || 'donnael.com';
        this.currentSport = this.options.defaultSport || 'soccer';
        this.currentDate = this.options.defaultDate || getTodayDateStr();
        this.rawMatches = null;
        this.init();
    }

    SportsWidget.prototype.init = function () {
        injectStyles();
        this.container.innerHTML = `
            <div class="sp-widget-root">
                <div class="sp-nav-sports-container">
                    <button class="sp-nav-arrow sp-nav-arrow-left" type="button" title="Scroll left">&#8249;</button>
                    <div class="sp-nav-sports-scroll"></div>
                    <div class="sp-more-dropdown-wrap">
                        <button class="sp-more-btn" type="button">More Sports &#9662;</button>
                        <div class="sp-more-menu"></div>
                    </div>
                    <button class="sp-nav-arrow sp-nav-arrow-right" type="button" title="Scroll right">&#8250;</button>
                </div>
                <div class="sp-date-strip"></div>
                <div class="sp-table-wrap">
                    <div class="sp-content-area"></div>
                </div>
            </div>
        `;
        this.bindEvents();
        this.renderSportsNav();
        this.renderDateStrip();
        this.fetchMatches();
    };

    SportsWidget.prototype.bindEvents = function () {
        var self = this;
        var leftArrow = this.container.querySelector('.sp-nav-arrow-left');
        var rightArrow = this.container.querySelector('.sp-nav-arrow-right');
        var scrollBox = this.container.querySelector('.sp-nav-sports-scroll');
        var moreBtn = this.container.querySelector('.sp-more-btn');
        var moreMenu = this.container.querySelector('.sp-more-menu');

        leftArrow.onclick = function () {
            scrollBox.scrollBy({ left: -200, behavior: 'smooth' });
        };
        rightArrow.onclick = function () {
            scrollBox.scrollBy({ left: 200, behavior: 'smooth' });
        };

        // Horizontal mouse wheel scrolling support
        scrollBox.addEventListener('wheel', function (e) {
            if (e.deltaY !== 0) {
                e.preventDefault();
                scrollBox.scrollLeft += e.deltaY;
            }
        }, { passive: false });

        moreBtn.onclick = function (e) {
            e.stopPropagation();
            moreMenu.classList.toggle('open');
        };

        document.addEventListener('click', function () {
            moreMenu.classList.remove('open');
        });
    };

    SportsWidget.prototype.getSportNum = function (sportId) {
        for (var i = 0; i < sportsList.length; i++) {
            if (sportsList[i].id === sportId) return sportsList[i].num;
        }
        return 4; // default soccer
    };

    SportsWidget.prototype.renderSportsNav = function () {
        var self = this;
        var scrollBox = this.container.querySelector('.sp-nav-sports-scroll');
        var moreMenu = this.container.querySelector('.sp-more-menu');
        var moreBtn = this.container.querySelector('.sp-more-btn');

        scrollBox.innerHTML = '';
        moreMenu.innerHTML = '';

        var isMoreActive = false;
        var activeMoreSport = null;

        sportsList.forEach(function (sport) {
            var isActive = (self.currentSport === sport.id);

            // Add primary sports to scroll bar
            if (sport.isPrimary) {
                var btn = document.createElement('button');
                btn.className = 'sp-sport-btn' + (isActive ? ' active' : '');
                btn.innerHTML = '<span>' + sport.icon + '</span> <span>' + escapeHtml(sport.name) + '</span>';
                btn.onclick = function () {
                    if (self.currentSport === sport.id) return;
                    self.currentSport = sport.id;
                    self.renderSportsNav();
                    self.fetchMatches();
                };
                scrollBox.appendChild(btn);
            }

            // In More Sports dropdown, list secondary sports
            if (!sport.isPrimary) {
                var mItem = document.createElement('button');
                mItem.className = 'sp-more-item' + (isActive ? ' active' : '');
                mItem.innerHTML = '<span>' + sport.icon + '</span> <span>' + escapeHtml(sport.name) + '</span>';
                mItem.onclick = function (e) {
                    e.stopPropagation();
                    moreMenu.classList.remove('open');
                    if (self.currentSport === sport.id) return;
                    self.currentSport = sport.id;
                    self.renderSportsNav();
                    self.fetchMatches();
                };
                moreMenu.appendChild(mItem);
                if (isActive) {
                    isMoreActive = true;
                    activeMoreSport = sport;
                }
            }
        });

        // If active sport is from the dropdown, also append temporary button in scroll bar and style More button
        if (isMoreActive && activeMoreSport) {
            moreBtn.innerHTML = '<span>' + activeMoreSport.icon + '</span> ' + escapeHtml(activeMoreSport.name) + ' &#9662;';
            moreBtn.classList.add('active');

            var extraBtn = document.createElement('button');
            extraBtn.className = 'sp-sport-btn active';
            extraBtn.innerHTML = '<span>' + activeMoreSport.icon + '</span> <span>' + escapeHtml(activeMoreSport.name) + '</span>';
            scrollBox.appendChild(extraBtn);
            extraBtn.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
        } else {
            moreBtn.innerHTML = 'More Sports &#9662;';
            moreBtn.classList.remove('active');
        }
    };

    SportsWidget.prototype.renderDateStrip = function () {
        var self = this;
        var strip = this.container.querySelector('.sp-date-strip');
        strip.innerHTML = '';
        var dates = generateDates();
        dates.forEach(function (item) {
            var a = document.createElement('div');
            var isSel = (self.currentDate === item.dateStr);
            a.className = 'sp-date-item' + (isSel ? ' active' : '');
            a.innerHTML = '<span class="sp-day-label">' + item.subLabel + '</span><span class="sp-date-label">' + item.dateLabel + '</span>';
            a.onclick = function () {
                if (self.currentDate === item.dateStr) return;
                self.currentDate = item.dateStr;
                strip.querySelectorAll('.sp-date-item').forEach(function (el) { el.classList.remove('active'); });
                a.classList.add('active');
                self.fetchMatches();
            };
            strip.appendChild(a);
        });
    };

    SportsWidget.prototype.fetchMatches = function () {
        var self = this;
        if (this.stopLiveScores) this.stopLiveScores();
        var generation = this.scoreGeneration = (this.scoreGeneration || 0) + 1;
        var content = this.container.querySelector('.sp-content-area');
        content.innerHTML = '<div class="sp-loading-box"><div class="sp-spinner"></div><div>Loading matches...</div></div>';

        var queryDate = this.currentDate ? (this.currentDate + ' 00:00:00') : '';
        var sportNum = this.getSportNum(this.currentSport);

        var url = this.proxyUrl + '?date=' + encodeURIComponent(queryDate) +
            '&one_link_team_to_team=1&site_url=' + encodeURIComponent(this.siteUrl) +
            '&sport=' + encodeURIComponent(sportNum) +
            '&dating=0&gzip=1';

        fetch(url)
            .then(function (res) { return res.text(); })
            .then(function (text) {
                var clean = text.trim();
                if (clean.indexOf('(') === 0 && clean.lastIndexOf(')') === clean.length - 1) {
                    clean = clean.substring(1, clean.length - 1);
                }
                var json = {};
                try {
                    json = JSON.parse(clean);
                } catch (e) {
                    console.error("Widget JSON parse error:", e);
                }
                if (generation !== self.scoreGeneration) return;
                self.rawMatches = json;
                self.renderMatches(json);
                var scoresUrl = new URL('scores.php', new URL(self.proxyUrl, document.baseURI)).href;
                self.stopLiveScores = window.SportsLiveScores.watchRows(self.host || self.container, scoresUrl);
            })
            .catch(function (err) {
                if (generation !== self.scoreGeneration) return;
                content.innerHTML = '<div class="sp-empty-box">Unable to load schedule. Please try again later.</div>';
                console.error("Widget fetch error:", err);
            });
    };

    SportsWidget.prototype.renderMatches = function (data) {
        var self = this;
        var content = this.container.querySelector('.sp-content-area');
        var eventsList = [];

        for (var sportKey in data) {
            if (!Object.prototype.hasOwnProperty.call(data, sportKey)) continue;
            var items = data[sportKey];
            if (Array.isArray(items)) {
                for (var j = 0; j < items.length; j++) {
                    var m = items[j];
                    m._sportKey = sportKey;
                    eventsList.push(m);
                }
            }
        }

        if (eventsList.length === 0) {
            content.innerHTML = '<div class="sp-empty-box">No matches scheduled for this sport on the selected date.</div>';
            return;
        }

        // Sort by league, then time
        eventsList.sort(function (a, b) {
            if (a.league < b.league) return -1;
            if (a.league > b.league) return 1;
            var ta = a.time ? (new Date(a.time)).getTime() : 0;
            var tb = b.time ? (new Date(b.time)).getTime() : 0;
            return ta - tb;
        });

        var html = '<table class="sp-table">';
        html += '<colgroup><col style="width:65px;"><col style="width:auto;"><col style="width:38px;"><col style="width:38px;"><col style="width:150px;"><col style="width:150px;"><col style="width:60px;"></colgroup>';

        var prevLeague = null;
        var currentHost = window.location.hostname.replace(/^www\./i, '');

        eventsList.forEach(function (val) {
            // League Header
            if (val.league !== prevLeague) {
                prevLeague = val.league;
                var flagImg = '';
                if (val.url_name_OP) {
                    var parts = val.url_name_OP.split('/');
                    if (parts[2] && parts[2] !== 'h2h') {
                        flagImg = "<img src='" + baseUrl + "images/flags/" + parts[2].toLowerCase() + ".png' height=18 style='vertical-align:middle;margin-right:6px;' onerror=\"this.style.display='none'\">";
                    }
                }
                if (!flagImg && val.country) {
                    flagImg = "<img src='" + baseUrl + "images/flags/" + val.country.toLowerCase().replace(/\s+/g, '-') + ".png' height=18 style='vertical-align:middle;margin-right:6px;' onerror=\"this.style.display='none'\">";
                }

                var leagueTitle = escapeHtml(val.league);
                html += '<tr class="sp-league-header">';
                html += '<td>Time</td>';
                html += '<td colspan="6">' + flagImg + leagueTitle + '</td>';
                html += '</tr>';
            }

            // Sport ID & Title
            var sId = val.sporttype_id ? parseInt(val.sporttype_id, 10) : self.getSportNum(self.currentSport);
            var matchTitle = getMatchTitle(val);

            // Resolve match link to tvevents.org if not local article
            var sportName = sportTypeMap[sId] || val._sportKey || val.sport_name || 'Soccer';
            sportName = ucwords(sportName.replace(/-/g, ' ')).replace(/\s+/g, '-');

            var matchHref = val.href;
            var isLocal = matchHref && matchHref.indexOf(currentHost) !== -1;
            if (!matchHref || matchHref === '#' || matchHref.indexOf('sportfrat.com') !== -1 || !isLocal) {
                var rawSlug = val.event_full1 || val.event1 || '';
                if (!rawSlug || rawSlug.indexOf('---') === -1 || rawSlug.indexOf('---') === 0 || rawSlug.lastIndexOf('---') === rawSlug.length - 3) {
                    var slugTitle = val.event_full || matchTitle;
                    rawSlug = slugTitle.replace(/\s+-\s+/g, '---').replace(/[\s\/]+/g, '-');
                }
                rawSlug = rawSlug.replace(/[^a-zA-Z0-9\-_]/g, '');
                var realId = val.first_event_team_to_team || val.event_id || '';
                matchHref = "https://tvevents.org/" + sportName + ".php/" + rawSlug + "/" + realId + "/";
            }

            var matchLinks = self.options.matchLinks !== false;

            // Clean scores and check Live status
            var cleanScores = cleanScore(val.scores, val.scores1, sId);
            var cleanLiveScore = cleanScore(val.live_score, null, sId);
            var isLive = !cleanScores && (val.live || (cleanLiveScore && cleanLiveScore !== 'False' && cleanLiveScore !== false));
            if (val.live && (!val.scores || val.scores === '')) isLive = true;

            // Start Time in user's browser local timezone (kickoff time)
            var formattedStartTime = formatTime(val.time);
            var timeCellHtml = escapeHtml(formattedStartTime);

            // Odds extraction
            var bet_k = val.bet_koef;
            if (typeof bet_k === 'string') bet_k = bet_k.split(':');
            var bet_avg = val.bet_koef_avg_percent;
            if (typeof bet_avg === 'string') bet_avg = bet_avg.split(':');

            var o1 = '', o0 = '', o2 = '';
            if (bet_avg) {
                if (bet_avg[1] && parseFloat(bet_avg[1]) > 0) o1 = parseFloat(bet_avg[1]).toFixed(2);
                if (bet_avg[0] && parseFloat(bet_avg[0]) > 0) o0 = parseFloat(bet_avg[0]).toFixed(2);
                if (bet_avg[2] && parseFloat(bet_avg[2]) > 0) o2 = parseFloat(bet_avg[2]).toFixed(2);
            }
            if (!o1 && bet_k) {
                if (bet_k[6] && parseFloat(bet_k[6]) > 0) o1 = parseFloat(bet_k[6]).toFixed(2);
                if (bet_k[7] && parseFloat(bet_k[7]) > 0) o0 = parseFloat(bet_k[7]).toFixed(2);
                if (bet_k[8] && parseFloat(bet_k[8]) > 0) o2 = parseFloat(bet_k[8]).toFixed(2);
            }

            var oddsLink = isHttpUrl(val.events_link_bet365) ? val.events_link_bet365 : (isHttpUrl(val.events_link_bwin) ? val.events_link_bwin : (matchLinks ? matchHref : ''));

            var oddsHtml = '';
            if (o1 !== '') {
                oddsHtml += formatOddsBadge(o1, oddsLink, matchLinks ? matchHref : '');
                if (o0 !== '') oddsHtml += formatOddsBadge(o0, oddsLink, matchLinks ? matchHref : '');
                if (o2 !== '') oddsHtml += formatOddsBadge(o2, oddsLink, matchLinks ? matchHref : '');
            } else {
                if (val.events_link_bet365) oddsHtml += formatBmBadge('365', val.events_link_bet365, matchLinks ? matchHref : '');
                if (val.events_link_bwin) oddsHtml += formatBmBadge('bwin', val.events_link_bwin, matchLinks ? matchHref : '');
                if (val.events_link_unibet) oddsHtml += formatBmBadge('uni', val.events_link_unibet, matchLinks ? matchHref : '');
            }
            if (!oddsHtml) {
                oddsHtml = formatEmptyBadge(40) + formatEmptyBadge(40) + formatEmptyBadge(40);
            }

            // Trend extraction
            var dropHtml = '';
            if (bet_k && bet_avg) {
                var d1 = formatDropVal(bet_k[6], bet_avg[1]);
                var d0 = (bet_k[7] && bet_avg[0]) ? formatDropVal(bet_k[7], bet_avg[0]) : '';
                var d2 = formatDropVal(bet_k[8], bet_avg[2]);
                if (d1 !== '') {
                    dropHtml = d1;
                    if (d0 !== '') dropHtml += d0;
                    if (d2 !== '') dropHtml += d2;
                }
            }
            if (!dropHtml && val.info_trend_match) {
                dropHtml = "<span style='font-size:11px;color:#475569;'>" + escapeHtml(val.info_trend_match) + "</span>";
            }
            if (!dropHtml) {
                dropHtml = formatEmptyBadge(44) + formatEmptyBadge(44) + formatEmptyBadge(44);
            }

            // Score & Live formatting
            // Finished matches: GREEN (#16a34a)
            // Live matches: RED (#dc2626) with match period/minute instead of [LIVE]
            var scoresHtml = '';
            if (cleanScores && cleanScores !== '' && !isLive) {
                scoresHtml = " <span class='sp-score-finished'>" + escapeHtml(cleanScores) + "</span>";
            } else if (isLive) {
                var liveScoreText = (cleanLiveScore && cleanLiveScore !== 'False' && cleanLiveScore !== false) ? cleanLiveScore : '';
                var liveTime = formatLiveTime(val.extra_info);
                var liveLabel = liveTime ? liveTime : 'LIVE';

                var liveScorePart = liveScoreText ? "<span class='sp-live-num'>" + escapeHtml(liveScoreText) + "</span> " : "";
                var liveScoreHtml = liveScorePart + "<span class='sp-live-time'>[" + escapeHtml(liveLabel) + "]</span>";
                scoresHtml = matchLinks
                    ? " <a href='" + escapeHtml(matchHref) + "' class='sp-live-badge' target='_blank'>" + liveScoreHtml + "</a>"
                    : " <span class='sp-live-badge'>" + liveScoreHtml + "</span>";
            }

            // SP (Score Prediction)
            var isWon = (cleanScores && (cleanScores === val.score_prediction || val.scores1 === val.score_prediction));
            var spHtml = formatSPBadge(val.score_prediction, isWon);

            var tvHtml = formatTvChannels(val.field_tv_channel);
            var tipHtml = formatTipCell(val, baseUrl, matchHref, matchLinks);
            var matchTitleHtml = matchLinks
                ? '<a href="' + escapeHtml(matchHref) + '" class="sp-event-link" target="_blank">' + escapeHtml(matchTitle) + '</a>'
                : '<span class="sp-event-link">' + escapeHtml(matchTitle) + '</span>';

            html += '<tr class="sp-match-row" data-live-id="' + escapeHtml(val.event_id) + '" data-live-start="' + ((new Date(val.time)).getTime() || 0) + '" data-live-final="' + (/^(FT|OT|PEN|CNC|ABN)$/.test(window.SportsLiveScores.state(val)) ? '1' : '0') + '" data-live-prediction="' + escapeHtml(val.score_prediction) + '">';
            html += '<td class="sp-col-time">' + timeCellHtml + '</td>';
            html += '<td class="sp-col-event">' + matchTitleHtml + '<span class="sp-live-score-target">' + scoresHtml + '</span></td>';
            html += '<td class="sp-col-tv">' + tvHtml + '</td>';
            html += '<td class="sp-col-tip">' + tipHtml + '</td>';
            html += '<td class="sp-col-trend">' + dropHtml + '</td>';
            html += '<td class="sp-col-odds">' + oddsHtml + '</td>';
            html += '<td class="sp-col-sp">' + spHtml + '</td>';
            html += '</tr>';
        });

        html += '</table>';
        content.innerHTML = html;
        self.bindTipTooltips(content);
    };

    SportsWidget.tipsCache = {};

    SportsWidget.prototype.bindTipTooltips = function (container) {
        var self = this;
        var tipWraps = container.querySelectorAll('.sp-tip-wrap');

        tipWraps.forEach(function (wrap) {
            var eid = wrap.getAttribute('data-eid');
            var h2h = wrap.getAttribute('data-h2h') || '';
            if (!eid) return;

            function loadTip() {
                if (wrap._tipLoaded) return;
                wrap._tipLoaded = true;

                var tooltipBody = wrap.querySelector('.sp-tip-body');
                if (!tooltipBody) return;

                var users = wrap.getAttribute('data-users') || '';
                var home = wrap.getAttribute('data-home') || 'Home';
                var away = wrap.getAttribute('data-away') || 'Away';
                var href = wrap.getAttribute('data-href') || '#';

                if (SportsWidget.tipsCache[eid]) {
                    self.renderTipContent(wrap, tooltipBody, SportsWidget.tipsCache[eid], users, home, away, href);
                    return;
                }

                var proxyBase = self.proxyUrl || defaultProxy;
                var proxyRecommendUrl = proxyBase + '?action=recommend&event_id=' + eid + (h2h ? '&h2h_id=' + h2h : '');
                fetch(proxyRecommendUrl)
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        SportsWidget.tipsCache[eid] = data;
                        self.renderTipContent(wrap, tooltipBody, data, users, home, away, href);
                    })
                    .catch(function () {
                        self.renderTipContent(wrap, tooltipBody, { has_tips: false, sections: [], bets: [] }, users, home, away, href);
                    });
            }

            wrap.addEventListener('mouseenter', loadTip, { passive: true });
            wrap.addEventListener('focusin', loadTip, { passive: true });
            wrap.addEventListener('touchstart', loadTip, { passive: true });
        });
    };

    SportsWidget.prototype.renderTipContent = function (wrap, container, data, users, home, away, href) {
        var html = '';

        var hasSections = data && data.sections && data.sections.length > 0;
        var hasBets = data && data.bets && data.bets.length > 0;

        if (!data || !data.has_tips || (!hasSections && !hasBets)) {
            // Hide icon if no verified predictions or bets exist
            if (wrap) {
                wrap.style.display = 'none';
            }
            return;
        }

        // 1. Render Editorial & Community Prediction Sections (Users Predictions, Selected Experts, etc.)
        if (hasSections) {
            html += '<div class="sp-tip-sections">';
            data.sections.forEach(function (sec) {
                if (!sec.title && !sec.body) return;
                var titleLower = (sec.title || '').toLowerCase();
                var badgeClass = 'sp-tip-sec-badge';
                var icon = '📌 ';
                if (titleLower.indexOf('user') !== -1) {
                    badgeClass += ' sp-tip-sec-users';
                    icon = '👥 ';
                } else if (titleLower.indexOf('expert') !== -1 || titleLower.indexOf('verified') !== -1) {
                    badgeClass += ' sp-tip-sec-experts';
                    icon = '⭐ ';
                } else if (titleLower.indexOf('consensus') !== -1) {
                    badgeClass += ' sp-tip-sec-consensus';
                    icon = '🎯 ';
                }

                html += '<div class="sp-tip-sec-block">';
                if (sec.title) {
                    html += '<span class="' + badgeClass + '">' + icon + escapeHtml(sec.title) + '</span>';
                }
                if (sec.body) {
                    html += '<div class="sp-tip-sec-body">' + escapeHtml(sec.body) + '</div>';
                }
                html += '</div>';
            });
            html += '</div>';
        }

        // 2. Render Tipster Consensus / Best Value Bets (if present)
        if (hasBets) {
            html += '<div class="sp-tip-bets-header">🎯 Best Value Tips</div>';
            html += '<div class="sp-tip-list">';
            data.bets.forEach(function (t) {
                var mktBadge = t.market ? '<span class="sp-tip-mkt">' + escapeHtml(t.market) + '</span>' : '';
                var pickHtml = '<strong class="sp-tip-pick">' + escapeHtml(t.pick || t.text) + '</strong>';
                var oddsHtml = t.odds ? ' <span class="sp-tip-odds">@' + escapeHtml(t.odds) + '</span>' : '';
                var votesHtml = t.votes ? ' <span class="sp-tip-votes">(' + escapeHtml(t.votes) + ')</span>' : '';
                var valBadge = t.best_value ? ' <span class="sp-tip-star" title="Best Value">⭐ Best Value</span>' : '';

                html += '<div class="sp-tip-item">' +
                            '<div class="sp-tip-item-main">' + mktBadge + pickHtml + oddsHtml + votesHtml + valBadge + '</div>' +
                        '</div>';
            });
            html += '</div>';
        }

        // 3. View Full Match Link
        if (href && isHttpUrl(href)) {
            html += '<a href="' + escapeHtml(href) + '" target="_blank" class="sp-tip-full-link">View Full Analysis & H2H →</a>';
        }

        container.innerHTML = html;
    };

    function autoInit() {
        var targets = document.querySelectorAll('[data-sp-widget], #sports-widget, .sports-widget-embed');
        targets.forEach(function (el) {
            if (el._sp_widget_initialized) return;
            el._sp_widget_initialized = true;
            new SportsWidget(el, {
                proxyUrl: el.getAttribute('data-proxy') || defaultProxy,
                siteUrl: el.getAttribute('data-site') || 'donnael.com',
                defaultSport: el.getAttribute('data-sport') || 'soccer',
                defaultDate: el.getAttribute('data-date') || '',
                matchLinks: el.getAttribute('data-match-links') !== '0' && el.getAttribute('data-match-links') !== 'false'
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }

    window.SportsWidget = SportsWidget;
})();
