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

The widget retrieves live data from TVEvents.org. See [LICENSE](LICENSE) for the code license.
