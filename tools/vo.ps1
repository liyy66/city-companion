Add-Type -AssemblyName System.Speech

$texts = @(
  '城市安心游，把三件事放在一个页面里：全国三千九百四十九座城市的地图，每座城市可核对的景点信息，还有一个会先查资料再回答的 AI 向导。',
  '底图用的是高德实时瓦片。换一座城市，行政边界和景点会一起加载。',
  '点开任意一张景点卡，票价、开放时间、从哪个门进，都标着出处和日期。',
  '问它问题的时候，它先查政府官网的原文，抓不到再退到公众号和公开检索，最后才交给模型组织语言。模型只能引用带编号的证据，没有出处的句子会被整句丢掉。',
  '所以每一句后面都有编号，点开就能回到原始页面。模型输出不合格会重试一次，还不行就退回证据引擎，不会编。',
  '连续追问不丢上下文。问完翠湖门票再问从哪个门进，它还在翠湖。换成重庆，也不会把上一座城市的景点带过来。',
  '查不到就说查不到，把还差哪几项列清楚，同时给出可以直接核对的入口。',
  '还有一个消费核验：把报价、必须另付的项目、发票和经营许可拆开算，告诉你哪几项有风险。',
  '深浅色两套主题，手机上也能用。'
)

$out = Join-Path $PSScriptRoot '..\dist\vo'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Huihui Desktop')
$synth.Rate = 1

for ($i = 0; $i -lt $texts.Count; $i++) {
  $n = $i + 1
  if ($n -eq 6) { continue }   # 第 6 段是空断句，不需要配音
  $file = Join-Path $out ("vo{0}.wav" -f $n)
  $synth.SetOutputToWaveFile($file)
  $synth.Speak($texts[$i])
  $synth.SetOutputToNull()
}
$synth.Dispose()

Get-ChildItem $out -Filter *.wav | Sort-Object Name | ForEach-Object {
  $ms = [math]::Round($_.Length / 32000 * 1000)
  '{0} {1}ms' -f $_.Name, $ms
}
