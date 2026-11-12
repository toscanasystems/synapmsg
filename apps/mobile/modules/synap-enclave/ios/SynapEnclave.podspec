Pod::Spec.new do |s|
  s.name           = 'SynapEnclave'
  s.version        = '1.0.0'
  s.summary        = 'Synap enclave / integrity probes'
  s.description    = 'Native root/jailbreak and Secure Enclave probes for Synap'
  s.author         = 'Toscana Systems'
  s.homepage       = 'https://synapmsg.ai'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
