<?php
/**
 * TVEvents Universal Schedule Proxy
 * Proxies AJAX requests to sportposter backend with gzip decompression support.
 * Also serves Recommended Bets / Predictions for the TVEvents Widget.
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: *');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$callback = isset($_GET["callback"]) ? preg_replace('/[^a-zA-Z0-9_\.]/', '', $_GET["callback"]) : '';
if (!empty($callback)) {
    header('Content-Type: application/javascript; charset=utf-8');
} else {
    header('Content-Type: application/json; charset=utf-8');
}

function tvevents_do_curl($target_url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $target_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_setopt($ch, CURLOPT_USERAGENT, 'TVEventsScheduleProxy/1.0');
    $res = curl_exec($ch);
    curl_close($ch);

    if ($res === false || empty($res)) {
        $context = stream_context_create([
            'http' => ['timeout' => 8, 'ignore_errors' => true],
            'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]
        ]);
        $res = @file_get_contents($target_url, false, $context);
    }
    return $res;
}

// -------------------------------------------------------------
// 1. ACTION: RECOMMEND / PREDICTIONS FOR WIDGET TOOLTIP
// -------------------------------------------------------------
if (isset($_GET['action']) && $_GET['action'] === 'recommend') {
    $event_id = isset($_GET['event_id']) ? (int)$_GET['event_id'] : 0;
    $h2h_id = isset($_GET['h2h_id']) ? (int)$_GET['h2h_id'] : 0;
    if ($event_id <= 0 && $h2h_id <= 0) {
        $out = json_encode(['event_id' => 0, 'has_tips' => false, 'sections' => [], 'bets' => []]);
        print !empty($callback) ? "{$callback}({$out});" : $out;
        exit;
    }

    $raw = '';
    // Query without mode=live2sport to retain Users Predictions and Selected Experts
    if ($event_id > 0) {
        $url = 'https://sportposter.agrogas.net/recommend_bet_oddsportal.php?event_id=' . $event_id;
        $raw = tvevents_do_curl($url);
    }
    if ((empty($raw) || strlen(trim($raw)) < 15 || strpos($raw, '404 Not Found') !== false) && $h2h_id > 0) {
        $url_h2h = 'https://sportposter.agrogas.net/recommend_bet_oddsportal.php?event_id=' . $h2h_id;
        $raw = tvevents_do_curl($url_h2h);
    }

    $sections = [];
    $bets = [];
    if (!empty($raw) && strpos($raw, '404 Not Found') === false && strlen(trim($raw)) > 15) {
        $blocks = preg_split('/<span[^>]*itemprop=[\'"]mainEntity[\'"]/i', $raw);
        foreach ($blocks as $b) {
            if (empty(trim($b))) continue;
            if (preg_match('/<span[^>]*itemprop=[\'"]name[\'"][^>]*style=[\'"]([^\'"]+)[\'"][^>]*>(.*?)<\/span>/is', $b, $mt)) {
                $style = $mt[1];
                $title = trim(strip_tags($mt[2]));
                $color = '';
                if (preg_match('/color:\s*([^;]+)/i', $style, $mc)) {
                    $color = trim($mc[1]);
                }

                if (preg_match('/<ul[^>]*>(.*?)<\/ul>/is', $b, $mul)) {
                    preg_match_all('/<li[^>]*>(.*?)<\/li>/is', $mul[1], $mlis);
                    if (!empty($mlis[1])) {
                        foreach ($mlis[1] as $li_str) {
                            $clean_li = trim(html_entity_decode(strip_tags($li_str), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                            $clean_li = preg_replace('/\s+/', ' ', $clean_li);
                            if (!empty($clean_li)) {
                                $is_bv = (stripos($clean_li, 'Best Value') !== false || mb_strpos($clean_li, '⭐') !== false);
                                $market = '';
                                $pick = '';
                                $odds = '';
                                $votes = '';
                                if (strpos($clean_li, ' - ') !== false) {
                                    $parts = explode(' - ', $clean_li, 2);
                                    $market = trim($parts[0]);
                                    $rest = trim($parts[1]);
                                    if (preg_match('/\(([\d\.]+)\)/', $rest, $mo)) {
                                        $odds = trim($mo[1]);
                                    }
                                    if (preg_match('/\(votes:\s*([^\)]+)\)/i', $rest, $mv)) {
                                        $votes = trim($mv[1]);
                                    }
                                    $p_parts = preg_split('/[\(⭐]|\bBest\b/u', $rest);
                                    $pick = trim($p_parts[0]);
                                }
                                $bet_item = [
                                    'text' => $clean_li,
                                    'best_value' => $is_bv,
                                    'market' => $market,
                                    'pick' => !empty($pick) ? $pick : $clean_li,
                                    'odds' => $odds,
                                    'votes' => $votes
                                ];
                                $bets[] = $bet_item;
                            }
                        }
                    }
                    $sections[] = [
                        'title' => $title,
                        'color' => $color,
                        'body' => ''
                    ];
                } else {
                    if (preg_match('/<span[^>]*itemprop=[\'"]text[\'"][^>]*>(.*?)<\/span>/is', $b, $mtext)) {
                        $body_raw = $mtext[1];
                    } else {
                        $body_raw = $b;
                    }
                    $clean_body = trim(html_entity_decode(strip_tags($body_raw), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    $clean_body = preg_replace('/\s+/', ' ', $clean_body);
                    $clean_body = preg_replace('/\s+([%.,;:)])/', '$1', $clean_body);
                    $clean_body = preg_replace('/([(])\s+/', '$1', $clean_body);
                    if (!empty($clean_body)) {
                        $sections[] = [
                            'title' => $title,
                            'color' => $color,
                            'body' => $clean_body
                        ];
                    }
                }
            }
        }
    }

    $payload = [
        'event_id' => $event_id,
        'has_tips' => (!empty($sections) || !empty($bets)),
        'sections' => $sections,
        'bets' => $bets
    ];

    $json_out = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if (!empty($callback)) {
        print "{$callback}({$json_out});";
    } else {
        print $json_out;
    }
    exit;
}

// -------------------------------------------------------------
// 2. DEFAULT ACTION: PROXY MATCH SCHEDULE
// -------------------------------------------------------------
$site_url = !empty($_GET["site_url"]) ? trim($_GET["site_url"]) : '';
if ($site_url === 'all' || empty($site_url) || $site_url === 'donnael.com' || $site_url === 'tvevents.org') {
    $site_url = 'donnael.com';
}

$params = [
    // Fixed server-side: callers cannot request the full legacy payload.
    'profile' => 'widget_v1',
    'date' => $_GET["date"] ?? '',
    'one_link_team_to_team' => !empty($_GET["one_link_team_to_team"]) ? $_GET["one_link_team_to_team"] : '1',
    'site_url' => $site_url,
    'dating' => $_GET["dating"] ?? '0',
    'sport' => !empty($_GET["sport"]) ? $_GET["sport"] : '4',
    'league' => $_GET["league"] ?? '',
    'league_name' => $_GET["league_name"] ?? '',
    'callback' => '',
    'gzip' => !empty($_GET["gzip"]) ? $_GET["gzip"] : '1',
    'top' => '0',
    '_' => $_GET["_"] ?? time()
];

$url = "https://sportposter.agrogas.net/schedule.php?" . http_build_query($params);
$response = tvevents_do_curl($url);

$text = '';
if ($response !== false && $response !== '') {
    $uncompressed = @gzdecode($response);
    $text = ($uncompressed !== false) ? $uncompressed : $response;
}

function tvevents_is_empty_res($str, $cb = '') {
    $t = trim($str);
    if (empty($t) || $t === '()' || $t === '({})' || $t === '({"":[]})') {
        return true;
    }
    if (!empty($cb)) {
        $prefix = $cb . '(';
        if (strpos($t, $prefix) === 0) {
            $inner = trim(substr($t, strlen($prefix)));
            $inner = rtrim($inner, "); \r\n\t");
            if (empty($inner) || $inner === '{}' || $inner === '{\"\":[]}' || $inner === '{"":[]}') {
                return true;
            }
        }
    }
    return false;
}

// Fallback: If sportposter returns empty because site_url is unknown in sportposter Sites table:
if (tvevents_is_empty_res($text, $callback) && $site_url !== 'sportfrat.com') {
    $params['site_url'] = 'sportfrat.com';
    $fallback_url = "https://sportposter.agrogas.net/schedule.php?" . http_build_query($params);
    $fallback_response = tvevents_do_curl($fallback_url);
    if ($fallback_response !== false && $fallback_response !== '') {
        $fallback_uncomp = @gzdecode($fallback_response);
        $text = ($fallback_uncomp !== false) ? $fallback_uncomp : $fallback_response;
    }
}

// Validate the widget contract before returning any upstream response.
// Fail closed if the upstream profile is unavailable or starts exposing extra fields.
$payload = json_decode($text, true);
$allowed_fields = array_fill_keys([
    'event_id', 'first_event_team_to_team', 'href', 'event', 'event_full', 'event_full1',
    'team_home', 'team_away', 'team_home_full', 'team_away_full', 'time', 'league',
    'country', 'sporttype_id', 'sport_name', 'scores', 'scores1', 'live', 'live_score',
    'extra_score', 'extra_info', 'field_tv_channel', 'score_prediction', 'info_trend_match',
    'count_users_predictions', 'url_name_OP', 'bet_koef', 'bet_koef_avg_percent', 'percent',
    'oddsportal_prediction', 'oddsportal_prediction_best_roi_users', 'has_predictions'
], true);
$valid = is_array($payload);
if ($valid) {
    foreach ($payload as $rows) {
        if (!is_array($rows)) { $valid = false; break; }
        foreach ($rows as $row) {
            if (!is_array($row) || empty($row['event_id']) || array_diff_key($row, $allowed_fields)) {
                $valid = false; break 2;
            }
        }
    }
}
if (!$valid) {
    http_response_code(502);
    $text = '{}';
} elseif (trim($text) === '') {
    $text = '{}';
}
print !empty($callback) ? $callback . '(' . $text . ');' : $text;
?>
