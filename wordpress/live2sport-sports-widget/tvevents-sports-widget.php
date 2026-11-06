<?php
/**
 * Plugin Name: Live2Sport – TV Guide, Live Scores & Predictions
 * Description: Add sports schedules, TV channel listings, live scores and match predictions to your website with an adaptive widget.
 * Version: 1.2.2
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Author: Live2Sport
 * Author URI: https://live2sport.com/
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 * Text Domain: live2sport-tv-guide-live-scores-predictions
 */

if (!defined('ABSPATH')) {
	exit;
}

final class TVEvents_Sports_Schedule_Widget {
	const SCRIPT_HANDLE = 'tvevents-sports-schedule-widget';
	const FLAGS_HANDLE = 'tvevents-sports-widget-flags';
	const SCRIPT_FILE = 'assets/sports-widget.js';
	const PROXY_URL = 'https://tvevents.org/widget/schedule_proxy.php';
	const DATA_SOURCE = 'tvevents.org';

	/**
	 * Sports supported by the TVEvents schedule service.
	 *
	 * @var string[]
	 */
	private static $sports = array(
		'soccer',
		'basketball',
		'hockey',
		'tennis',
		'handball',
		'baseball',
		'volleyball',
		'table-tennis',
		'darts',
		'badminton',
		'american-football',
		'futsal',
		'esports',
		'boxing',
		'mma',
		'snooker',
		'cricket',
		'rugby-union',
		'rugby-league',
		'floorball',
		'water-polo',
		'bandy',
		'beach-soccer',
		'australian-football',
		'canadian-football',
		'arena-football',
		'pesapallo',
	);

	/** Register hooks and the public shortcode. */
	public static function init() {
		add_action('init', array(__CLASS__, 'register_script'));
		add_action('admin_menu', array(__CLASS__, 'admin_menu'));
		add_action('admin_init', array(__CLASS__, 'register_settings'));
		add_shortcode('live2sport_widget', array(__CLASS__, 'render_shortcode'));
		add_shortcode('tvevents_widget', array(__CLASS__, 'render_shortcode'));
	}

	/** Register the widget JavaScript shipped with this plugin. */
	public static function register_script() {
		$script_path = plugin_dir_path(__FILE__) . self::SCRIPT_FILE;
		$version = file_exists($script_path) ? (string) filemtime($script_path) : '1.2.2';
		wp_register_script(
			self::FLAGS_HANDLE,
			plugins_url('assets/flags.js', __FILE__),
			array(),
			'1.2.2',
			true
		);

		wp_register_script(
			self::SCRIPT_HANDLE,
			plugins_url(self::SCRIPT_FILE, __FILE__),
			array(self::FLAGS_HANDLE),
			$version,
			true
		);
	}

	/**
	 * Render a schedule container and enqueue the bundled widget once.
	 *
	 * Usage: [tvevents_widget sport="soccer" match_links="yes"]
	 *
	 * @param array  $attributes Shortcode attributes.
	 * @param string $content    Optional shortcode content (unused).
	 * @return string
	 */
	public static function render_shortcode($attributes, $content = '') {
		$attributes = shortcode_atts(
			self::settings(),
			$attributes,
			'tvevents_widget'
		);

		$sport = sanitize_key($attributes['sport']);
		if (!in_array($sport, self::$sports, true)) {
			$sport = 'soccer';
		}

		$date = self::sanitize_date($attributes['date']);
		$match_links = self::is_enabled($attributes['match_links']);
		$odds_display = $attributes['odds_display'] === 'percent' ? 'percent' : 'odds';

		wp_enqueue_script(self::SCRIPT_HANDLE);

		$container_id = function_exists('wp_unique_id')
			? wp_unique_id('tvevents-widget-')
			: 'tvevents-widget-' . wp_rand(100000, 999999);

		$container_attributes = array(
			'id'               => $container_id,
			'class'            => 'sports-widget-embed',
			'data-sp-widget'   => '',
			'data-sport'       => $sport,
			'data-site'        => self::DATA_SOURCE,
			'data-proxy'       => self::PROXY_URL,
			'data-match-links' => $match_links ? '1' : '0',
			'data-odds-display' => $odds_display,
			'data-credits' => self::is_enabled($attributes['credits']) ? '1' : '0',
			'data-predictions' => self::is_enabled($attributes['predictions']) ? '1' : '0',
		);

		if ($date !== '') {
			$container_attributes['data-date'] = $date;
		}

		$output = '<div';
		foreach ($container_attributes as $name => $value) {
			$output .= ' ' . $name . '="' . esc_attr($value) . '"';
		}
		$output .= '></div>';
		$output .= '<noscript>' . esc_html__('Enable JavaScript to view the sports schedule.', 'live2sport-tv-guide-live-scores-predictions') . '</noscript>';

		return $output;
	}

	/** Default values shared by shortcodes and the site settings screen. */
	public static function defaults() {
		return array(
				'sport'       => 'soccer',
				'date'        => '',
				'match_links' => 'no',
				'odds_display' => 'odds',
				'credits' => 'no',
				'predictions' => 'yes',
			);
	}

	public static function settings() {
		return self::sanitize_settings(get_option('tvevents_widget_settings', self::defaults()));
	}

	/** Validate stored values; a shortcode can still override each setting. */
	public static function sanitize_settings($input) {
		$input = is_array($input) ? $input : array();
		$values = self::defaults();
		$values['sport'] = isset($input['sport']) && in_array($input['sport'], self::$sports, true) ? $input['sport'] : 'soccer';
		$values['date'] = isset($input['date']) ? self::sanitize_date($input['date']) : '';
		$values['odds_display'] = isset($input['odds_display']) && $input['odds_display'] === 'percent' ? 'percent' : 'odds';
		foreach (array('match_links', 'credits', 'predictions') as $key) {
			$values[$key] = isset($input[$key]) ? (self::is_enabled($input[$key]) ? 'yes' : 'no') : $values[$key];
		}
		return $values;
	}

	public static function admin_menu() {
		add_options_page(__('Live2Sport – TV Guide, Live Scores & Predictions', 'live2sport-tv-guide-live-scores-predictions'), __('Live2Sport Widget', 'live2sport-tv-guide-live-scores-predictions'), 'manage_options', 'tvevents-sports-widget', array(__CLASS__, 'settings_page'));
	}

	public static function register_settings() {
		register_setting('tvevents_widget', 'tvevents_widget_settings', array('type' => 'array', 'sanitize_callback' => array(__CLASS__, 'sanitize_settings'), 'default' => self::defaults()));
	}

	public static function settings_page() {
		if (!current_user_can('manage_options')) {
			return;
		}
		$values = self::settings();
		$choices = array(
			'sport' => array_combine(self::$sports, array_map('ucwords', str_replace('-', ' ', self::$sports))),
			'odds_display' => array('odds' => __('Decimal odds', 'live2sport-tv-guide-live-scores-predictions'), 'percent' => __('Market probabilities (%)', 'live2sport-tv-guide-live-scores-predictions')),
			'predictions' => array('yes' => __('Show', 'live2sport-tv-guide-live-scores-predictions'), 'no' => __('Hide', 'live2sport-tv-guide-live-scores-predictions')),
			'credits' => array('yes' => __('Show', 'live2sport-tv-guide-live-scores-predictions'), 'no' => __('Hide', 'live2sport-tv-guide-live-scores-predictions')),
			'match_links' => array('no' => __('Disabled', 'live2sport-tv-guide-live-scores-predictions'), 'yes' => __('Enabled', 'live2sport-tv-guide-live-scores-predictions')),
		);
		$labels = array('sport' => __('Sport', 'live2sport-tv-guide-live-scores-predictions'), 'odds_display' => __('Odds display', 'live2sport-tv-guide-live-scores-predictions'), 'predictions' => __('Prediction icons', 'live2sport-tv-guide-live-scores-predictions'), 'credits' => __('Powered by Live2Sport link', 'live2sport-tv-guide-live-scores-predictions'), 'match_links' => __('Match links to TVEvents', 'live2sport-tv-guide-live-scores-predictions'));
		$descriptions = array(
			'credits' => __('Show adds a public footer credit linking to live2sport.com. Off by default.', 'live2sport-tv-guide-live-scores-predictions'),
			'match_links' => __('Enabled adds public links to tvevents.org on match titles and in prediction tooltips. Off by default.', 'live2sport-tv-guide-live-scores-predictions'),
		);
		echo '<div class="wrap"><h1>' . esc_html__('Live2Sport – TV Guide, Live Scores & Predictions', 'live2sport-tv-guide-live-scores-predictions') . '</h1>';
		echo '<p>' . esc_html__('Save your preferences, then paste the shortcode below into a Shortcode block on any page or post. Existing shortcodes with explicit parameters keep their own values.', 'live2sport-tv-guide-live-scores-predictions') . '</p>';
		echo '<form method="post" action="options.php">';
		settings_fields('tvevents_widget');
		echo '<table class="form-table" role="presentation">';
		foreach ($choices as $key => $options) {
			echo '<tr><th scope="row"><label for="tvw-' . esc_attr($key) . '">' . esc_html($labels[$key]) . '</label></th><td><select id="tvw-' . esc_attr($key) . '" name="tvevents_widget_settings[' . esc_attr($key) . ']">';
			foreach ($options as $value => $label) {
				echo '<option value="' . esc_attr($value) . '" ' . selected($values[$key], $value, false) . '>' . esc_html($label) . '</option>';
			}
			echo '</select>';
			if (isset($descriptions[$key])) {
				echo '<p class="description">' . esc_html($descriptions[$key]) . '</p>';
			}
			echo '</td></tr>';
		}
		echo '</table>';
		submit_button();
		echo '</form><h2>' . esc_html__('Shortcode', 'live2sport-tv-guide-live-scores-predictions') . '</h2><p><code>[live2sport_widget]</code></p>';
		echo '<p>' . esc_html__('This shortcode always uses the saved settings above. Select and copy it into a Shortcode block.', 'live2sport-tv-guide-live-scores-predictions') . '</p></div>';
	}

	/** Convert common shortcode boolean values to a strict boolean. */
	private static function is_enabled($value) {
		return in_array(strtolower(trim((string) $value)), array('1', 'true', 'yes', 'on'), true);
	}

	/** Validate an optional date in YYYY-MM-DD format. */
	private static function sanitize_date($date) {
		$date = is_string($date) ? trim($date) : '';
		if ($date === '') {
			return '';
		}

		if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
			return '';
		}

		$date_object = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
		if (!$date_object || $date_object->format('Y-m-d') !== $date) {
			return '';
		}

		return $date;
	}
}

TVEvents_Sports_Schedule_Widget::init();
