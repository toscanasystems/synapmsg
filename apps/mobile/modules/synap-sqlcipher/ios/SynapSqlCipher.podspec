Pod::Spec.new do |s|
  s.name           = 'SynapSqlCipher'
  s.version        = '1.0.0'
  s.summary        = 'Synap SQLCipher NDK bridge'
  s.description    = 'SQLCipher native store for Synap'
  s.license        = 'AGPL-3.0'
  s.author         = 'Toscana Systems'
  s.homepage       = 'https://synapmsg.ai'
  s.platforms      = { :ios => '13.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
