# Dilmanc — Azure Azərbaycan səsinin qurulması

Bu versiyada Azure Neural TTS inteqrasiyası hazırdır. Canlı xidmət üçün öz Azure Speech resursunuzun açarı və regionu lazımdır. Həqiqi açar bu paketdə yoxdur və canlı səs sınağı aparılmayıb.

## 1. Azure məlumatlarını götürün

1. https://portal.azure.com ünvanında öz hesabınıza daxil olun.
2. Speech xidməti üçün resurs yaradın və ya mövcud Speech resursunu açın. Bunun üçün Azure abunəliyi lazımdır; hesabdakı plan və tarif şərtlərini öz portalınızda yoxlayın.
3. `Keys and Endpoint` səhifəsində `KEY 1` və `Location/Region` məlumatını götürün. Region qısa kod olmalıdır, məsələn `westeurope`; endpoint URL-ni region yerinə yazmayın.
4. Açarı söhbətə və ya `js/` fayllarına yazmayın. Növbəti addımda yalnız öz terminalınıza daxil edin.

Rəsmi istinad: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech

## 2. Proqramı başladın

ZIP-i çıxarın, içindəki `dilmanc` qovluğunda terminal açın. Python 3.10+ lazımdır; əlavə kitabxana quraşdırılmır.

```sh
python3 server.py --configure
```

Terminal əvvəl regionu, sonra açarı soruşur. Açarı daxil edəndə ekranda görünməməsi normaldır. Məlumatlar lokal `.env` faylında saxlanır. Server dərhal başlayır.

Brauzerdə **http://localhost:8000** açın. Daha əvvəl eyni ünvan/port və brauzer profilində nümunə toplamısınızsa, onlar yerində qalır. Köhnə server 8000 portunda işləyirsə, əvvəl onu Ctrl+C ilə dayandırın. Portu dəyişmək brauzerdə başqa yaddaş açır; lazım olduqda köhnə ünvanınızdan dataseti ixrac edin.

Növbəti dəfə yalnız:

```sh
python3 server.py
```

Windows-da `python3` tapılmırsa `py server.py --configure` və sonra `py server.py` istifadə edin.

## 3. Səsi sınayın

`Lüğət və ayarlar → Azərbaycan səsi`:

- **Banu** — qadın, `az-AZ-BanuNeural`.
- **Babek** — kişi, `az-AZ-BabekNeural`.

`Sına` düyməsinə basın. Sınaq cümləsi: “Salam! Başım ağrıyır, həkim lazımdır.” Azərbaycan hərfləri, ritm, səsləndirmə və kompüterin səs çıxışını yoxlayın. Sürət Azure SSML-də -5% qoyulub. Keyfiyyəti özünüz dinləyib səsi seçin.

`Bağlantını yoxla` yalnız lokal serverin mövcudluğunu və ayarların doldurulmasını göstərir; açarın həqiqətən işlədiyini `Sına` yoxlayır.

## 4. Demo üçün internet ehtiyatı

1. Lüğət və cümlə qaydalarını tamamlayın.
2. Bir səs seçin və internet açıqkən `Demo səslərini hazırla` düyməsini basın.
3. Bu düymə lüğətdəki ayrı söz cümlələrini, birləşmə qaydalarını və standart demo cümlələrini seçilmiş səs ilə yaradır. Azure istifadəsi hesabınızın şərtlərinə görə hesablana bilər.
4. Tam demoda səsləndirəcəyiniz əlavə cümləni də ən azı bir dəfə səsləndirin; o da saxlanır.
5. İnterneti söndürüb proqramı və həmin cümlələri yenidən sınayın. Lokal server işləməyə davam etməlidir.

Audio `.dilmanc-cache/tts/` içində saxlanır. Yalnız **eyni mətn + eyni səs** diskdən təkrar oxunur. Başqa cümlə və ya səs seçiləndə yeni Azure sorğusu lazımdır. Lüğəti/modeli ixrac etmək audio faylları daxil etmir. Ehtiyat kompüterə səsləri də aparmaq üçün `.dilmanc-cache` qovluğunu ayrıca köçürün və orada serveri başladın. Bu paketin ZIP-inə şəxsi açar və yaranmış səslər daxil edilmir.

## 5. Xəta mesajları

| Mesaj | Addım |
|---|---|
| Səs serveri bağlıdır | Adi statik serveri dayandırın və `python3 server.py` başladın |
| Azure qurulmayıb | `python3 server.py --configure` ilə açarı və regionu daxil edin |
| Açar, region və giriş icazəsini yoxlayın | Məlumatların eyni Speech resursundan gəldiyini yoxlayın, yenidən qurub serveri başladın |
| Azure sorğu limiti dolub | Portalda kvotanı yoxlayın və sonra yenidən sınayın |
| Azure-a bağlantı alınmadı | İnterneti yoxlayın; yalnız əvvəl saxlanmış eyni cümlələr oflayn işləyir |
| Brauzer səsi blokladı | Ekrandakı `Səsləndir` və ya `Sına` düyməsini basın, saytın audio icazəsini yoxlayın |
| Address already in use | Köhnə 8000 portlu serveri dayandırın |

## 6. Məlumat axını və yoxlama

Kamera və işarə tanıma lokaldır. Səsləndirmə üçün yeni mətn lokal serverdən Azure-a göndərilir. API açarı yalnız lokal serverdədir; status cavabı, brauzer JavaScript-i, model və dataset ixracına əlavə edilmir. Lokal server `.env`, `.git` və audio keşini statik fayl kimi təqdim etmir. Bu server 127.0.0.1 üçün nəzərdə tutulub; internetə açıq hostinq/deploy bu yeniləmənin hissəsi deyil.

Mikrofonla danışığı mətnə çevirmək hələ brauzerin SpeechRecognition xidmətindən istifadə edir; Azure Speech-to-Text bu dəyişiklikdə qoşulmayıb.

Texniki testlər:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
npm test
```

İnterfeys axını üçün `npm install`, sonra `npm run test:ui`. Testlər saxta Azure audio cavabından istifadə edir; xidmətə real ödənişli sorğu göndərmir və səsin təbiiliyini yoxlamır.
