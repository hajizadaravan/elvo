# Dilmanc

**Əllərin səsi.** Dilmanc kameradan Azərbaycan işarə dilini tanıyır və onu səsli Azərbaycan dilinə çevirir. Cavab isə əksinə gedir: həkim danışır, sözləri ekranda yazılır, kar insan oxuyur.

İlk ssenari: **poliklinikanın qeydiyyat masası.** 8 işarə, bir neçə hazır cümlə, iki tərəfli söhbət.

Hər şey brauzerin içində işləyir: nümunə yazmaq, modeli öyrətmək və tanımaq. Server yoxdur, API açarı yoxdur, video heç yerə göndərilmir.

## İşə salmaq

Kamera yalnız `localhost` və ya `https` üzərində açılır, ona görə faylı birbaşa açmaq olmaz:

```sh
npx serve .            # və ya
python3 -m http.server 8000
```

Sonra `http://localhost:3000` (və ya `:8000`) ünvanını açın.

- **Microsoft Edge** istifadə edin: Azərbaycan dilində təbii səslər (Banu, Babek) yalnız Edge-də var. Chrome türk səsinə keçir.
- Danışığı mətnə çevirmək (cavab paneli) Chrome və Edge-də işləyir.
- **Səhnə üçün oflayn rejim:** `sh scripts/vendor.sh` bütün modelləri `vendor/` qovluğuna endirir (təxminən 35 MB). Bundan sonra zal Wi-Fi-ı lazım deyil.

## Necə işləyir

1. **MediaPipe** hər kadrda iki əlin 21 nöqtəsini və çiyinləri tapır.
2. Hər kadr 134 rəqəmə çevrilir: əlin forması (biləyə nisbətən) və əlin harada olduğu (çiyinlərə nisbətən). Ona görə model kameranın məsafəsindən və insanın boyundan çox asılı deyil.
3. 30 kadr (təxminən 1 saniyə) bir nümunədir. Kiçik **Conv1D** şəbəkə (TensorFlow.js) bu ardıcıllığı işarəyə çevirir.
4. Tanınan işarələr qaydalarla cümləyə çevrilir: `baş + ağrı` → "Başım ağrıyır." Qaydaları "Lüğət və ayarlar" bölməsində dəyişmək olur.
5. 1,8 saniyə sükutdan sonra cümlə səsləndirilir (və ya `Enter`).

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
4. **Səhnədə yeni işarə (30 san).** Münsiflərdən biri bir söz seçir, 10 nümunə yazılır, model 30 saniyədə yenidən öyrənir və tanıyır.

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
- Azərbaycanda karların çoxu türk işarə dilinə yaxın variantdan istifadə edir. Lüğəti real istifadəçilərlə birlikdə qurun.
