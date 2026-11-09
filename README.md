# Live2Sport Sports Widget

Add a live sports schedule to a website. The widget shows fixtures, local kickoff times, live scores, and TV broadcasters where listings are available.

[Live demo](https://nazarini18.github.io/live2sport-sports-widget/) · [Live2Sport](https://live2sport.com/)

## WordPress

Install and activate [Live2Sport - TV Guide, Live Scores & Predictions](https://wordpress.org/plugins/live2sport-tv-guide-live-scores-predictions/). Add a Shortcode block to a post or page and paste:

```text
[live2sport_widget sport="soccer"]
```

## HTML

Paste this snippet where the widget should appear:

```html
<div class="sports-widget-embed" data-sport="soccer" data-match-links="0"></div>
<script src="https://nazarini18.github.io/live2sport-sports-widget/sports-widget.js" async></script>
```

## npm and jsDelivr

Install with `npm install live2sport-sports-widget`, then serve `sports-widget.js` from the installed package and load it with a script tag in your HTML.

For direct CDN use, keep the same container and use this script URL:

```html
<script src="https://cdn.jsdelivr.net/npm/live2sport-sports-widget@1.0.0/sports-widget.js" async></script>
```

The script runs in the browser. It fetches the schedule and loads widget images from TVEvents.org, so the host page needs network access to that domain.

The widget retrieves live data from TVEvents.org. See [LICENSE](LICENSE) for the code license.
