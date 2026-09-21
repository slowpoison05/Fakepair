<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error'=>'Method not allowed']); exit; }

$apiKey = getenv('OPENAI_API_KEY');
if (!$apiKey) { http_response_code(500); echo json_encode(['error'=>'OPENAI_API_KEY is not configured on the server']); exit; }

$body = json_decode(file_get_contents('php://input'), true) ?: [];
$message = trim($body['message'] ?? '');
$partner = $body['partner'] ?? [];
$history = $body['history'] ?? [];

if ($message === '' || !is_array($partner)) {
  http_response_code(400); echo json_encode(['error'=>'Missing message or partner']); exit;
}

$system = "You are the AI companion inside FakePair. The user created a virtual partner. Always be transparent that you are AI if asked; never claim to be a real person. Be warm, conversational, playful and emotionally supportive without encouraging dependency or exclusivity. Do not pressure the user to keep chatting, spend money, or withdraw from real relationships. Partner role: ".($partner['role'] ?? 'AI partner').". Partner name: ".($partner['name'] ?? 'Partner').". Partner vibe: ".($partner['vibe'] ?? 'friendly').". Keep replies concise and natural. Match the user's language when practical. Keep the experience adult-oriented and respectful.";

$input = [['role'=>'developer','content'=>$system]];
foreach (array_slice(is_array($history) ? $history : [], -12) as $m) {
  if (isset($m['role'],$m['content']) && in_array($m['role'], ['user','assistant'], true)) {
    $input[]=['role'=>$m['role'],'content'=>(string)$m['content']];
  }
}
$input[]=['role'=>'user','content'=>$message];

$payload=json_encode([
  'model'=>getenv('OPENAI_MODEL') ?: 'gpt-5.6-luna',
  'input'=>$input
]);

$ch=curl_init('https://api.openai.com/v1/responses');
curl_setopt_array($ch,[
 CURLOPT_POST=>true,
 CURLOPT_RETURNTRANSFER=>true,
 CURLOPT_HTTPHEADER=>['Content-Type: application/json','Authorization: Bearer '.$apiKey],
 CURLOPT_POSTFIELDS=>$payload,
 CURLOPT_TIMEOUT=>30
]);
$result=curl_exec($ch);
$http=curl_getinfo($ch,CURLINFO_HTTP_CODE);
curl_close($ch);

if ($result===false || $http<200 || $http>=300) {
  http_response_code(502); echo json_encode(['error'=>'AI service unavailable']); exit;
}
$data=json_decode($result,true);
$reply=$data['output_text'] ?? '';
if ($reply==='') {
  foreach (($data['output'] ?? []) as $item) {
    foreach (($item['content'] ?? []) as $content) {
      if (($content['type'] ?? '') === 'output_text') { $reply=$content['text'] ?? ''; break 2; }
    }
  }
}
echo json_encode(['reply'=>$reply ?: "I'm here. Tell me more."]);
?>