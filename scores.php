<?php
/** Minimal, bounded score-only proxy for displayed sports events. */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo '[]'; exit; }
$input = isset($_POST['ids']) && is_string($_POST['ids']) ? $_POST['ids'] : '';
if (strlen($input) > 1400 || !preg_match('/^\d{1,12}(,\d{1,12}){0,99}$/D', $input)) {
    http_response_code(400); echo '[]'; exit;
}
$ids = array_values(array_unique(explode(',', $input)));
$payload = array_map(function($id) { return array('event_id' => $id); }, $ids);
$ch = curl_init('https://sportposter.agrogas.net/events_scores_update.php');
curl_setopt_array($ch, array(CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload), CURLOPT_HTTPHEADER => array('Content-Type: application/json'), CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 8));
$raw = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$data = is_string($raw) ? json_decode($raw, true) : null;
if ($status !== 200 || !is_array($data)) { http_response_code(502); echo '[]'; exit; }
$output = array();
foreach ($data as $row) {
    if (!is_array($row) || !isset($row['event_id']) || !in_array((string)$row['event_id'], $ids, true)) { continue; }
    $item = array('event_id' => (string)$row['event_id']);
    foreach (array('score_end','additional_score_end','live_score','extra_score','extra_info','update_score') as $key) {
        $item[$key] = isset($row[$key]) && is_scalar($row[$key]) ? substr((string)$row[$key], 0, 2000) : '';
    }
    $output[] = $item;
}
echo json_encode($output);
