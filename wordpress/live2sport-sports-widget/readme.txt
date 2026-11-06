=== Live2Sport – TV Guide, Live Scores & Predictions ===
Contributors: live2sport
Tags: sports, fixtures, schedule, live scores, tv listings
Requires at least: 5.8
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.2.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html

Add sports schedules, TV channel listings, live scores and match predictions to your website with an adaptive widget.

== Description ==

Display match schedules across multiple sports, with kickoff times in each visitor's local timezone, TV channel listings, automatically updated scores and final results. Let visitors explore community predictions and score forecasts, view decimal odds or market-implied probabilities. Configure the widget through WordPress settings and add it to any page using a shortcode.

The display JavaScript and image assets are included in the plugin. The schedule data is provided by the TVEvents.org service, operated by Live2Sport.

Public links to TVEvents and the Live2Sport footer credit are both off by default. The site owner can enable them separately in **Settings > Live2Sport Widget** or for an individual shortcode. The plugin does not display bookmaker names, buttons, or links. Odds are always plain, non-clickable numbers.

== Installation ==

1. Upload the plugin ZIP from the WordPress Plugins screen, or upload the plugin folder to `/wp-content/plugins/`.
2. Activate **Live2Sport – TV Guide, Live Scores & Predictions**.
3. Open **Settings > Live2Sport Widget** to select your display preferences.
4. Add `[live2sport_widget]` to a post, page, or shortcode-enabled widget area.

Choose a sport:

`[live2sport_widget sport="basketball"]`

Choose an optional date in `YYYY-MM-DD` format:

`[live2sport_widget sport="soccer" date="2026-10-29"]`

Choose decimal odds (the default):

`[live2sport_widget sport="soccer" odds_display="odds"]`

Or show normalized implied probabilities instead of decimal odds:

`[live2sport_widget sport="soccer" odds_display="percent"]`

The three positions represent home (1), draw (X), and away (2). As on sportschedule.tv, valid service-provided percentages take priority. Otherwise the plugin uses current average odds, with current market odds as a fallback, and calculates `(1 / odds) / sum(1 / odds) * 100` to remove the market margin proportionally. These are market-implied values, not an independent prediction or a guarantee. Each outcome is rounded to one decimal place, so the displayed total may be 99.9% or 100.1%. For two-outcome markets, the draw position shows a dash. If both valid service percentages and complete odds are missing, the plugin shows dashes rather than inferring a probability from one outcome. Unsupported `odds_display` values fall back to decimal odds.

Enable TVEvents links on match titles and in prediction tooltips for a single widget:

`[live2sport_widget sport="soccer" match_links="yes"]`

The `match_links` option accepts `yes`, `true`, `on`, or `1`. An explicit shortcode option overrides the corresponding site setting. If the date is omitted or invalid, the widget uses its normal current-date behavior.

Supported sport values: `soccer`, `basketball`, `hockey`, `tennis`, `handball`, `baseball`, `volleyball`, `table-tennis`, `darts`, `badminton`, `american-football`, `futsal`, `esports`, `boxing`, `mma`, `snooker`, `cricket`, `rugby-union`, `rugby-league`, `floorball`, `water-polo`, `bandy`, `beach-soccer`, `australian-football`, `canadian-football`, `arena-football`, and `pesapallo`.

The optional "Powered by Live2Sport" footer linking to https://live2sport.com/ is disabled by default. Enable it in Settings or explicitly with `credits="yes"`. Prediction tooltip icons are enabled by default when prediction data is available; disable them with `predictions="no"`. These options are independent of `match_links`.

Example: `[live2sport_widget sport="soccer" credits="yes" predictions="yes" odds_display="percent"]`

Existing `[tvevents_widget]` shortcodes continue to work with the same settings. The recommended shortcode for new installations is `[live2sport_widget]`.

== External service and privacy ==

The schedule proxy always requests the widget_v1 response profile. It returns only fields used by the widget and rejects unexpected schedule fields.

While a schedule is displayed, eligible matches refresh approximately every 50 seconds via https://tvevents.org/widget/scores.php. Only numeric event IDs are submitted; no WordPress account data is sent. Requests pause when the tab is hidden. Completed matches stop polling.

The plugin loads its display JavaScript and images from the WordPress site. When a page containing the shortcode is viewed, the visitor's browser requests schedule data from `https://tvevents.org/widget/schedule_proxy.php`. The request includes the selected sport and schedule date, along with standard connection information such as the visitor's IP address and browser details. The plugin does not send WordPress account or profile data to TVEvents.org and stores only widget display preferences in the WordPress database; it does not store visitor data there.

The widget can request event prediction data from the same service when a visitor opens a supported prediction tooltip. Site owners should disclose this third-party service in their privacy notice as appropriate. The schedule will not load if the visitor's browser or network blocks requests to TVEvents.org.

Service policies: [TVEvents Terms and Conditions](https://tvevents.org/terms-conditions.php) and [TVEvents Privacy Policy](https://tvevents.org/privacy-policy.php).

== Frequently Asked Questions ==

= Where do the flags come from? =

Country flags are bundled SVG images from flag-icons (https://github.com/lipis/flag-icons), licensed under MIT. The copyright and license notice is in licenses/flag-icons-MIT.txt; the pinned source revision is documented in licenses/SOURCES.txt. Old country spellings are mapped to the same files. Unknown regions and unsupported organisations use an original neutral globe. No external image CDN is used.

= Does the active theme change the widget styling? =

The widget renders inside a Shadow DOM with its own styles, fonts and layout. Theme rules for tables, links and images do not change the internal alignment or hover states. The theme still determines the width available to the shortcode container.

= Are external links or credits enabled by default? =

No. The TVEvents match links and the Live2Sport footer credit are independent opt-in choices in **Settings > Live2Sport Widget**. Use `match_links="yes"` or `credits="yes"` to enable either one for a specific shortcode. Schedules, scores and prediction tooltips work with both options disabled.

= Does the plugin store settings or user data? =

The plugin stores the site administrator's widget preferences in a WordPress option, including the selected sport, odds display, prediction icons, match links and footer credit. Manage them under **Settings > Live2Sport Widget**. The plugin does not store visitor data in the WordPress database.

= Does the plugin include its display code? =

Yes. The JavaScript and image assets are packaged locally. Schedule and optional prediction data are still served by the TVEvents.org service.

= Can I show more than one widget on a page? =

Yes. Each shortcode creates its own container. Different sports, dates, and link preferences can be used on the same page.

== Changelog ==

= 1.2.2 =
* Clarify saved display preferences, external service policies and opt-in choices for public links.

= 1.2.1 =
* Match the translation text domain to the WordPress.org assigned plugin slug.

= 1.2.0 =
* Rename the plugin to Live2Sport – TV Guide, Live Scores & Predictions.
* Add the live2sport_widget shortcode while preserving existing shortcodes and settings.

= 1.1.1 =
* Use the restricted widget schedule profile and validate the proxy response contract.
* Remove unused raw prediction text from tooltip responses.

= 1.1.0 =
* Refresh displayed live scores and statuses using bounded score-only requests.
* Pause in hidden tabs and preserve expanded details during updates.

= 1.0.9 =
* Disable the public credit link by default; show it only when explicitly enabled.

= 1.0.8 =
* Use a normal cursor and remove hover highlighting for non-clickable TV channels.

= 1.0.7 =
* Keep narrow match rows compact; reveal odds, trends and score predictions with a Details button.

= 1.0.6 =
* Adapt match rows to narrow widget containers without horizontal table scrolling.

= 1.0.5 =
* Add per-site settings for sport, odds display, prediction icons, credit link and match links.

= 1.0.4 =
* Add optional Live2Sport footer credit and prediction icons, both enabled by default.

= 1.0.3 =
* Isolate widget styling from WordPress themes using Shadow DOM.
* Match livestream.fan time/status labels, live/finished score badges and detailed score tooltips.
* Remove the number overlay from the TV icon while retaining the channel tooltip.
* Align league flags and names, and replace the prediction trigger with a target icon.
* Apply link hover styling only to actual enabled match links.

= 1.0.2 =
* Remove bookmaker names, buttons, and links from the packaged widget.
* Add an odds_display option for decimal odds or normalized implied probabilities.
* Keep odds and percentages non-clickable independently of optional match links.
* Replace legacy flags with locally bundled MIT-licensed flag-icons SVGs and map legacy country names.
* Replace the TV and prediction icons with original GPL-compatible SVG drawings.

= 1.0.1 =
* Include widget JavaScript and image assets in the plugin package.
* Make links from match content to TVEvents optional and disabled by default.
* Document the external schedule and prediction service.

= 1.0.0 =
* Initial shortcode wrapper for the TVEvents.org hosted widget.
