Add-Type -AssemblyName System.Speech

# 与 dist/video/frames.json 的 marks 一一对应（第 6 段是空断句，不出音）
$texts = @(
  '城市安心游，把三件事放在一个页面：全国三千九百四十九座城市的地图，可核对的景点信息，还有一个会先查资料再回答的 AI 向导。',
  '底图用高德实时瓦片，换城市连行政边界一起加载。',
  '景点卡：票价、开放时间、从哪个门进，都标着出处和日期。',
  '问问题的时候先查政府官网原文，抓不到再退到公众号和公开检索，最后才交给模型组织语言。模型只能引用带编号的证据，没有出处的句子整句丢掉。',
  '所以每句话后面都有编号，点开就能回到原始页面。模型输出不合格会重试一次，还不行就退回证据引擎，不会编。',
  '',
  '连续追问不丢上下文：问完翠湖门票再问从哪个门进，它还在翠湖；换成重庆也不会串。',
  '查不到就说查不到，把还差哪几项列清楚。',
  '还有消费核验：报价、必须另付的项目、发票、经营许可，拆开算。',
  '深浅色两套主题，手机上也能用。'
)

$out = Join-Path $PSScriptRoot '..\dist\vo'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Huihui Desktop')
$synth.Rate = 2

for ($i = 0; $i -lt $texts.Count; $i++) {
  $n = $i + 1
  if ([string]::IsNullOrWhiteSpace($texts[$i])) { continue }
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
