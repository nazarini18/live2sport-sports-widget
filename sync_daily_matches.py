import json
import urllib.request
import re
from datetime import datetime

def fetch_schedule(sport):
    url = f"https://tvevents.org/widget/schedule_proxy.php?action=schedule&sport={sport}&date=today"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode())
            events = []
            for sp_key, ev_list in data.items():
                if isinstance(ev_list, list):
                    for ev in ev_list:
                        ev_title = ev.get('event', '').strip()
                        ev_id = ev.get('event_id', '')
                        if not ev_title or not ev_id:
                            continue
                        
                        # Determine sport PHP page
                        sport_page = "Soccer.php"
                        if sport == "basketball":
                            sport_page = "Basketball.php"
                        elif sport == "hockey":
                            sport_page = "Hockey.php"
                        
                        slug_parts = [re.sub(r'[^a-zA-Z0-9]', '', p.strip()).replace(' ', '-') for p in ev_title.split('-')]
                        if len(slug_parts) >= 2 and slug_parts[0] and slug_parts[1]:
                            url_match = f"https://tvevents.org/{sport_page}/{slug_parts[0]}/{slug_parts[1]}/{ev_id}/"
                        else:
                            url_match = f"https://tvevents.org/{sport_page}/Match/{ev_id}/"
                        
                        events.append({
                            "title": ev_title.replace('-', ' vs '),
                            "sport": sport.capitalize(),
                            "league": ev.get('league', sport.capitalize()),
                            "time": ev.get('time', 'Today'),
                            "url": url_match
                        })
            return events
    except Exception as e:
        print(f"Error fetching {sport}: {e}")
        return []

def main():
    soccer_matches = fetch_schedule("soccer")
    basketball_matches = fetch_schedule("basketball")
    hockey_matches = fetch_schedule("hockey")

    all_matches = soccer_matches[:8] + basketball_matches[:4] + hockey_matches[:4]

    if not all_matches:
        print("No matches fetched, using default curated fixtures.")
        all_matches = [
            {"title": "Arsenal vs Chelsea", "sport": "Soccer", "league": "Premier League", "time": "Today", "url": "https://tvevents.org/Soccer.php/Arsenal/Chelsea/3904300/"},
            {"title": "Real Madrid vs Barcelona", "sport": "Soccer", "league": "LaLiga", "time": "Today", "url": "https://tvevents.org/Soccer.php/Real-Madrid/Barcelona/3904301/"},
            {"title": "Bayern Munich vs Borussia Dortmund", "sport": "Soccer", "league": "Bundesliga", "time": "Today", "url": "https://tvevents.org/Soccer.php/Bayern-Munich/Borussia-Dortmund/3904302/"},
            {"title": "Boston Celtics vs Los Angeles Lakers", "sport": "Basketball", "league": "NBA", "time": "Tonight", "url": "https://tvevents.org/Basketball.php/Boston-Celtics/Los-Angeles-Lakers/3904310/"},
            {"title": "New York Rangers vs New Jersey Devils", "sport": "Hockey", "league": "NHL", "time": "Tonight", "url": "https://tvevents.org/Hockey.php/New-York-Rangers/New-Jersey-Devils/3904315/"}
        ]

    # 1. Update data/today_fixtures.json
    export_json = {
        "provider": "TVEvents.org",
        "provider_url": "https://tvevents.org",
        "updated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        "total_fixtures": len(all_matches),
        "fixtures": all_matches
    }
    with open("data/today_fixtures.json", "w", encoding="utf-8") as fp:
        json.dump(export_json, fp, indent=2)
    print("Updated data/today_fixtures.json")

    # 2. Build Markdown Table
    now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    table_md = f"<!-- DAILY_MATCHES_START -->\n"
    table_md += f"*Daily schedule snapshot curated from the [TVEvents.org](https://tvevents.org) broadcast engine. Last updated: {now_str}.*\n\n"
    table_md += "| Sport | Match | Competition | Kick-off | Live TV Broadcast & Channels |\n"
    table_md += "| :--- | :--- | :--- | :---: | :--- |\n"
    for m in all_matches[:15]:
        table_md += f"| {m['sport']} | **{m['title']}** | {m['league']} | {m['time']} | [📺 TV Schedule & Match Center]({m['url']}) |\n"
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
        # Replace the section under Today's Featured Match Center
        pattern = r"(## 📅 Today's Featured Match Center.*?\n\n).*?(\n> \*For the complete)"
        replacement = r"\g<1>" + table_md + r"\g<2>"
        new_readme = re.sub(pattern, replacement, readme, flags=re.DOTALL)

    with open("README.md", "w", encoding="utf-8") as fp:
        fp.write(new_readme)
    print("Updated README.md with daily match table.")

if __name__ == "__main__":
    main()
