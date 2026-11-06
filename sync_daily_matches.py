import json
import urllib.request
import re
from datetime import datetime

# Exact sport mapping from tvevents.org / sportposter
SPORTS_CONFIG = [
    {
        'id': 'soccer',
        'num': 4,
        'label': 'Soccer',
        'page': 'Soccer.php',
        'limit': 6
    },
    {
        'id': 'basketball',
        'num': 2,
        'label': 'Basketball',
        'page': 'Basketball.php',
        'limit': 4
    },
    {
        'id': 'tennis',
        'num': 5,
        'label': 'Tennis',
        'page': 'Tennis.php',
        'limit': 4
    },
    {
        'id': 'hockey',
        'num': 3,
        'label': 'Ice Hockey',
        'page': 'Hockey.php',
        'limit': 3
    }
]

def clean_slug(text):
    return re.sub(r'[^a-zA-Z0-9\-_]', '', text.replace(' ', '-'))

def fetch_sport_fixtures(sport_cfg):
    num = sport_cfg['num']
    label = sport_cfg['label']
    page = sport_cfg['page']
    
    url = f"https://tvevents.org/widget/schedule_proxy.php?date=today&one_link_team_to_team=1&site_url=tvevents.org&sport={num}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    
    fixtures = []
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            for key, ev_list in data.items():
                if not isinstance(ev_list, list):
                    continue
                for ev in ev_list:
                    team_home = ev.get('team_home', '').strip()
                    team_away = ev.get('team_away', '').strip()
                    ev_id = str(ev.get('event_id', '')).strip()
                    
                    # Both teams must be valid names (no empty, no placeholders)
                    if not team_home or not team_away or not ev_id:
                        continue
                    if len(team_home) < 2 or len(team_away) < 2:
                        continue
                    
                    # Slug construction matching sports-widget.js
                    raw_slug = ev.get('event_full1', '').strip()
                    if not raw_slug or '---' not in raw_slug:
                        raw_slug = f"{clean_slug(team_home)}---{clean_slug(team_away)}"
                    else:
                        raw_slug = clean_slug(raw_slug)
                        
                    url_match = f"https://tvevents.org/{page}/{raw_slug}/{ev_id}/"
                    
                    fixtures.append({
                        "title": f"{team_home} vs {team_away}",
                        "sport": label,
                        "league": ev.get('league', '').strip() or label,
                        "time": ev.get('time', 'Today').strip(),
                        "url": url_match,
                        "has_tv": bool(ev.get('field_tv_channel')),
                        "has_pred": bool(ev.get('has_predictions'))
                    })
                    if len(fixtures) >= sport_cfg['limit']:
                        break
    except Exception as e:
        print(f"Error fetching {label}: {e}")
        
    return fixtures

def main():
    all_curated = []
    for sp_cfg in SPORTS_CONFIG:
        res = fetch_sport_fixtures(sp_cfg)
        print(f"Fetched {len(res)} fixtures for {sp_cfg['label']}")
        all_curated.extend(res)
        
    # 1. Update data/today_fixtures.json
    export_json = {
        "provider": "TVEvents.org",
        "provider_url": "https://tvevents.org",
        "updated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        "total_fixtures": len(all_curated),
        "fixtures": all_curated
    }
    with open("data/today_fixtures.json", "w", encoding="utf-8") as fp:
        json.dump(export_json, fp, indent=2, ensure_ascii=False)
    print("Updated data/today_fixtures.json successfully.")

    # 2. Build Markdown Table
    now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    table_md = f"<!-- DAILY_MATCHES_START -->\n"
    table_md += f"*Daily schedule snapshot curated from the [TVEvents.org](https://tvevents.org) broadcast engine. Last updated: {now_str}.*\n\n"
    table_md += "| Sport | Match | Competition | Kick-off | Live TV Broadcast & Channels |\n"
    table_md += "| :--- | :--- | :--- | :---: | :--- |\n"
    for m in all_curated:
        table_md += f"| **{m['sport']}** | {m['title']} | {m['league']} | {m['time']} | [📺 TV Schedule & Match Center]({m['url']}) |\n"
    table_md += f"\n<!-- DAILY_MATCHES_END -->"

    # 3. Update README.md
    with open("README.md", "r", encoding="utf-8") as fp:
        readme = fp.read()

    if "<!-- DAILY_MATCHES_START -->" in readme and "<!-- DAILY_MATCHES_END -->" in readme:
        new_readme = re.sub(
            r'<!-- DAILY_MATCHES_START -->.*?<!-- DAILY_MATCHES_END -->',
            table_md,
            readme,
            flags=re.DOTALL
        )
    else:
        pattern = r"(## 📅 Today's Featured Match Center.*?\n\n).*?(\n> \*For the complete)"
        replacement = r"\g<1>" + table_md + r"\g<2>"
        new_readme = re.sub(pattern, replacement, readme, flags=re.DOTALL)

    with open("README.md", "w", encoding="utf-8") as fp:
        fp.write(new_readme)
    print("Updated README.md with accurate sports classification and verified team names.")

if __name__ == "__main__":
    main()
