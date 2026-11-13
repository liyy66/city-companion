Add-Type -AssemblyName System.Speech

# 对应 dist/video/frames.json 的 7 个 marks（0/17.0/22.3/29.2/50.3/76.4/100.4）
$texts = @(
  '城市安心游，把三件事放在一个页面：全国三千九百四十九座城市的地图，可核对的景点信息，还有一个会先查资料再回答的 AI 向导。',
  '底图用高德实时瓦片，换城市连行政边界一起加载。',
  '景点卡：票价、开放时间、从哪个门进，都标着出处和日期。',
  '问问题的时候先查政府官网原文，抓不到再退到公众号和公开检索，最后才交给模型组织语言。模型只能引用带编号的证据，没有出处的句子整句丢掉。',
  '所以每句话后面都有编号，点开就能回到原始页面。连续追问也不丢上下文：问完翠湖门票再问从哪个门进，它还在翠湖；换成重庆也不会串。',
  '查不到就说查不到，把还差哪几项列清楚。还有消费核验：报价、必须另付的项目、发票、经营许可，拆开算。',
  '深浅色两套主题，手机上也能用。整站也能打成一个 HTML，离线双击就能看。'
)

$out = Join-Path $PSScriptRoot '..\dist\vo3'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Huihui Desktop')
$synth.Rate = 2

for ($i = 0; $i -lt $texts.Count; $i++) {
  $file = Join-Path $out ("vo{0}.wav" -f ($i + 1))
  $synth.SetOutputToWaveFile($file)
  $synth.Speak($texts[$i])
  $synth.SetOutputToNull()
}
$synth.Dispose()

Get-ChildItem $out -Filter *.wav | Sort-Object Name | ForEach-Object {
  $h = [System.IO.File]::ReadAllBytes($_.FullName)
  $rate = [BitConverter]::ToUInt32($h, 24)
  $sec = ($_.Length - 44) / ($rate * 2)
  '{0} {1:N2}s' -f $_.Name, $sec
}
