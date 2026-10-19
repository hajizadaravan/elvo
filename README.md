# Dilmanc

**Əllərin səsi.** Dilmanc kameradan Azərbaycan işarə dilini tanıyır və onu səsli Azərbaycan dilinə çevirir. Cavab isə əksinə gedir: həkim danışır, sözləri ekranda yazılır, kar insan oxuyur.

İlk ssenari: **poliklinikanın qeydiyyat masası.** 8 işarə, bir neçə hazır cümlə, iki tərəfli söhbət.

Nümunə yazmaq, modeli öyrətmək və işarələri tanımaq brauzerdə işləyir. Kamera videosu serverə göndərilmir. Azərbaycan dilində səsləndirmə Azure Neural TTS ilə edilir: yeni cümlənin mətni Azure-a göndərilir, yaranan audio lokal saxlanır. API açarı brauzerə verilmir.

## İşə salmaq

Python 3.10+ tələb olunur; əlavə Python paketi lazım deyil. ZIP-i çıxarın, `dilmanc` qovluğunda terminal açın:

```sh
python3 server.py --configure
```

Azure Speech resursunun regionunu və KEY-ni terminalda daxil edin. Açar ekranda görünmür və lokal `.env` faylında saxlanır. Sonra `http://localhost:8000` açın. Növbəti açılışlar üçün:

```sh
python3 server.py
```

`Lüğət və ayarlar → Sına` ilə bağlantını və səsi yoxlayın. Banu (qadın) və Babek (kişi) arasında seçim var. `Demo səslərini hazırla` seçilən səs üçün əsas cümlələri əvvəlcədən yaradır. Əvvəl saxlanmış eyni cümlələr internet kəsiləndə işləyir; yeni mətn üçün internet lazımdır.

- Chrome və ya Edge istifadə edin. Azure səsi brauzerin sistem səslərindən asılı deyil; türk səsinə keçid yoxdur.
- Danışığı mətnə çevirmək brauzerin mikrofon xidmətindən istifadə edir və internet tələb edə bilər.
- `vendor/` içində kamera və təlim runtime faylları artıq var. Yeniləmək üçün `sh scripts/vendor.sh` istifadə olunur.
- Adi `python3 -m http.server` və `npx serve` yalnız statik hissəni açır; Azure üçün `server.py` lazımdır.
- Əvvəlki datasetin görünməsi üçün brauzer profilini və ünvanı/portu eyni saxlayın. `localhost` ilə `127.0.0.1` ayrı yaddaş sayılır.

Tam qurulma təlimatı: **AZURE_QURULMA_AZ.md**.

## Necə işləyir

1. **MediaPipe** hər kadrda iki əlin 21 nöqtəsini və çiyinləri tapır.
2. Hər kadr 134 rəqəmə çevrilir: əlin forması (biləyə nisbətən) və əlin harada olduğu (çiyinlərə nisbətən). Ona görə model kameranın məsafəsindən və insanın boyundan çox asılı deyil.
3. 1 saniyəlik zaman pəncərəsi 30 kadra uyğunlaşdırılır; kamera FPS-i dəyişəndə nümunənin müddəti dəyişmir. Kiçik **Conv1D** şəbəkə (TensorFlow.js) bu ardıcıllığı işarəyə çevirir.
4. Tanınan işarələr qaydalarla cümləyə çevrilir: `baş + ağrı` → "Başım ağrıyır." Qaydaları "Lüğət və ayarlar" bölməsində dəyişmək olur.
5. Son qəbul olunan işarədən 1,8 saniyə sonra cümlə səsləndirilir (və ya `Enter`).

## Məlumat toplama protokolu

Münsiflərin ilk sualı: "Bu, sizin öz əllərinizdə işləyir, bəs başqasında?" Cavab rəqəmlə olmalıdır.

1. **İşarələri uydurmayın.** Hər işarəni Azərbaycan işarə dilini bilən biri ilə (Kar və Lal Cəmiyyəti, məktəb müəllimi, CODA) yoxlayın və videoya çəkin. Lazım olsa lüğəti dəyişin.
2. Hər işarə üçün **ən azı 20 nümunə, 3+ imzalayandan**. "Fon" sinfi də vacibdir: əllər aşağı, saç düzəltmək, telefon tutmaq.
3. Hər kəs öz adı ilə yazsın. Ad modelin yoxlanması üçün lazımdır.
4. Fərqli işıq, fərqli paltar, fərqli məsafə. Bir neçə nümunəni oturaraq yazın.
5. Komanda bir neçə kompüterdə yazırsa: "Dataseti yüklə" → bir kompüterdə "Dataset idxal et".
6. Modeli **"Görülməmiş imzalayan"** rejimində öyrədin: model bir insanı heç görmədən onun üzərində yoxlanır. Təqdimatda bu rəqəmi göstərin, sonra son model avtomatik bütün data ilə öyrədilir.

## Demo ssenarisi (3 dəqiqə)

1. **Problem (30 san).** Kar insan həkimə gedir. Tərcüməçi yoxdur, yazı ilə danışmaq yavaşdır və hamı oxuya bilmir.
2. **Canlı (90 san).** Səhnə rejimi (`Səhnə rejimi`, çıxış `Esc`). İmzalayan: *salam* → *baş* → *ağrı* → *dərman*. Dilmanc deyir: "Salam! Başım ağrıyır, dərman lazımdır." Komanda üzvü həkim kimi cavab verir, sözlər ekranda görünür.
3. **Sübut (30 san).** Model bölməsi: görülməmiş imzalayan üzərində dəqiqlik, hər işarə üzrə nəticə.
4. **Səhnədə yeni işarə (30 san).** Münsiflərdən biri bir söz seçir, 10 nümunə yazılır, model yenidən öyrədilir və tanıma sınanır. Müddəti əvvəlcə öz kompüterinizdə ölçün.

Ehtiyat plan: canlı demo alınmasa, eyni ssenarinin əvvəlcədən çəkilmiş videosu.

## Komanda planı (bu gün)

| Kim | Nə |
|---|---|
| 1 nəfər | İşarə dilini bilən adamı tapır, 8 işarəni təsdiqlədir |
| 2 nəfər | Nümunə yazır (hərəsi hər işarə üçün 10+) |
| 1 nəfər | Modeli öyrədir, hədd və qaydaları tənzimləyir |
| 1 nəfər | Slaydlar, ehtiyat video, demo məşqi |

## Fayllar

```
index.html        tətbiqin bütün ekranları
css/app.css       üslub
js/main.js        ekranlar, yazma, canlı tərcümə
js/vision.js      kamera + MediaPipe əl və bədən nöqtələri
js/features.js    kadr → 134 rəqəm, augmentasiya
js/model.js       TF.js modeli: öyrətmə, yoxlama, saxlama
js/vocab.js       lüğət və cümlə qaydaları
js/speech.js      səsləndirmə və danışığın tanınması
js/store.js       nümunələr IndexedDB-də, idxal və ixrac
js/charts.js      qrafiklər
scripts/vendor.sh oflayn rejim üçün modelləri endirir
```

Test üçün kamerasız açmaq: `http://localhost:8000/?nocam`.

## Məhdudiyyətlər

- Bu, kiçik lüğətli prototipdir, tam işarə dili tərcüməçisi deyil. Qrammatika, mimika və barmaq əlifbası hələ yoxdur.
- ASL və ya türk işarə dili dataseti avtomatik Azərbaycan işarə dilinin dataseti sayılmır. Lüğəti yerli işarə dilini bilən real istifadəçilərlə birlikdə qurun.


## Final hazırlığı üçün yenilənmiş paket

Bu paketdə hazır Azərbaycan işarə dili klassifikatoru və sizin brauzerdəki nümunələr YOXDUR. `vendor/models/` içindəki modellər əl və bədən nöqtələrini tapır; sözləri sizin datasetinizdən öyrənən model ayrıdır.

1. Əvvəl köhnə tətbiqi işlətməyə davam etdiyiniz eyni brauzer, eyni profil və eyni ünvan/portda `Dataseti yüklə` ilə nümunələri ehtiyatlayın. Köhnə düymə `Modeli yüklə` TF çəkilərini çıxarır, tam daşınan paket deyil.
2. Bu faylları açın. Eyni origin istifadə edilirsə mövcud IndexedDB nümunələri və model saxlanır. Yeni origin istifadə edilirsə dataseti idxal edin və yenidən öyrədin. Əvvəlki nümunələr aşağı FPS ilə yazılıbsa, yeni sabit müddətli nümunələr toplayıb yenidən sınaqdan keçirin.
3. Modeli öyrətdikdən sonra `Lüğət və ayarlar → Hazır modeli ixrac et` seçin. Tək JSON modelin çəkilərini, sinif sırasını, lüğəti və yoxlama nəticəsini saxlayır.
4. Ehtiyat kompüterdə `Hazır model idxal et` seçin. Yenidən öyrətmək lazım deyil. Dataseti ayrıca idxal etmək yalnız gələcəkdə öyrətməyi davam etdirmək üçün lazımdır.
5. Şəbəkəni söndürün, səhifəni yeniləyin və kameranı yoxlayın. Lokal əl/bədən modelləri artıq `vendor/` içindədir. Azure-da əvvəlcədən hazırlanmış eyni cümlələrin səslənməsini də sınayın. Yeni cümlə və mikrofon üçün internet lazım ola bilər; yazılı cavab ehtiyatdır.

### Dəyişikliklər

- 1 saniyəlik zamana görə 30 kadra uyğunlaşdırma; uzun kamera donmalarında nümunə qəbul edilmir.
- Qəbuldan əvvəl sabit qalma, ilk iki sinif arasındakı fərq və təkrar söz üçün neytral fasilə.
- Hazır modelin tam ixracı, idxalı və lüğətlə uyğunluq yoxlaması.
- Datasetdə ölçü, rəqəm, sinif və təkrarlanan ID yoxlaması; cümlə qaydaları da idxal edilir.
- Görülməmiş imzalayan bölgüsündə bütün siniflərin hər iki tərəfdə olması yoxlanır.
- Qarışma matrisi və siniflər üzrə orta recall; yoxlama modeli ilə bütün data ilə öyrədilmiş canlı model açıq fərqləndirilir.
- Mikrofon üçün yazılı və hazır cavablar; məxfilik mətni dəqiqləşdirilib.
- Tensor sızması və bəzi xəta/dayandırma halları düzəldilib.

### Yoxlama

Python server sınaqları: `python3 -m unittest discover -s tests -p 'test_*.py' -v`. Azure cavabları sınaqda əvəz edilir; real xidmət yoxlanmır.

Node.js 20+ olduqda `npm test` (əlavə npm paketi quraşdırılmır). Testlər sintetik texniki nümunələrdən istifadə edir; keçməsi real işarə dəqiqliyi demək deyil.

İnterfeys axınının simulyasiya testi üçün `npm install`, sonra `npm run test:ui`. Bu test JSDOM, saxta IndexedDB və sintetik data ilə işləyir; real kamera, vizual yerləşmə, WebGL və səs yoxlanmır.

Ətraflı prioritetlər, data toplama, ölçmə və təqdimat planı: `FINAL_PLANI_AZ.md`.
