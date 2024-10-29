<?php
error_reporting(-1);
ini_set('display_errors', 1);

date_default_timezone_set('Asia/Ho_Chi_Minh');
$date = date('Y-m-d H:i');
$log_dir = __DIR__.'/../logs/';
$log_time_dir = $log_dir.$date;
@mkdir($log_time_dir, 0777, true);
foreach(scandir($log_dir) as $f) {
  echo $f, PHP_EOL;
  if (!($f == '.' || $f == '..')) {
    @chmod($log_dir.$f, 0777);
    @unlink($log_dir.$f);
  }
}

if (!isset($_FILES['log'])) exit;

$log_file = $_FILES['log'];
if (move_uploaded_file($log_file['tmp_name'], $log_time_dir.'/'.$log_file['name'])) {
  echo 'Upload OK: '.$date.'/'.$log_file['name'];
}else{
  echo 'Upload Failed';
}
