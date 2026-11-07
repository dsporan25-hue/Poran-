# PORAN LIVE — পরবর্তী কাজ

## আজকের সেভ
- Git commit: a92595f
- GitHub branch: main
- ScreenCaptureService-এ prepareVideo(), prepareAudio() ও startStream(url) আছে।
- Microphone permission flow যোগ করা হয়েছে।
- Manifest-এ mediaProjection ও microphone foreground service permissions আছে।

## পরবর্তী কাজ
1. RootEncoder 2.8.1-এর audio API ও microphone capture যাচাই।
2. Gallery video-এর ছবি ও আসল ভিডিও অডিও Facebook Live-এ পাঠানোর ব্যবস্থা।
3. Facebook RTMP Server URL ও Stream Key একবার নিরাপদে সংরক্ষণ।
4. Start/Stop Live এবং প্রকৃত connection status যাচাই।
5. GitHub Actions দিয়ে APK build, ফোনে install ও Facebook Live Producer-এ পরীক্ষা।

## গুরুত্বপূর্ণ
- Facebook Stream Key কাউকে পাঠানো যাবে না বা GitHub-এ রাখা যাবে না।
- Internal video audio এখনো নিশ্চিতভাবে কাজ করছে না।
- বাস্তব Facebook Live পরীক্ষা না হওয়া পর্যন্ত অ্যাপকে সম্পূর্ণ বলা যাবে না।
- পরের কাজ শুরু: cd ~/PORAN_LIVE
