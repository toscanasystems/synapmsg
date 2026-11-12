Pod::Spec.new do |s|
  s.name           = 'SynapLibsignal'
  s.version        = '1.0.0'
  s.summary        = 'Synap libsignal JNI/Cocoa bridge'
  s.description    = 'Official Signal libsignal bind for Synap'
  s.license        = 'AGPL-3.0'
  s.author         = 'Toscana Systems'
  s.homepage       = 'https://synapmsg.ai'
  s.platforms      = { :ios => '13.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
