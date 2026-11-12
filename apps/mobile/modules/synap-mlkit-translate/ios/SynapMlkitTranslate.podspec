Pod::Spec.new do |s|
  s.name           = 'SynapMlkitTranslate'
  s.version        = '1.0.0'
  s.summary        = 'On-device translation (Apple Translation + ML Kit fallback)'
  s.description    = 'Private-chat MT: Apple Translation framework; ML Kit if language missing'
  s.author         = 'Toscana Systems'
  s.homepage       = 'https://synapmsg.ai'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # ML Kit only as fallback when Apple Translation cannot cover a pair.
  s.dependency 'GoogleMLKit/Translate', '7.0.0'
  s.dependency 'GoogleMLKit/LanguageID', '7.0.0'
  s.source_files = '**/*.{h,m,mm,swift}'
end
