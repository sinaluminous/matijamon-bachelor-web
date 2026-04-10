# 🍻 BACHELOR SPECIAL — Upute za Pajo

## TLDR

**Link:** https://matijamon-bachelor.vercel.app

Idi na link, klikni jedan od tri gumba, odigraj. To je to.

---

## Što je ovo

Igra za pijenje za Matijinu momačku. Kombinacija Truth or Drink-a, Kings Cup-a i Matijamon borbi. Hrvatski jezik, Pasko-ova playlist 8-bit muzike, 1900+ pitanja/izazova. **Web aplikacija — radi s mobitela, laptopa, smart TV-a.**

## 3 načina za igrati

Na glavnoj stranici imaš 3 gumba — biraj prema situaciji:

### 🟡 ONLINE IGRA *(za s ekipom u stanu/klubu s WiFi-jem)*
- Otvoriš link na **TV-u ili laptopu**, klikneš **POKRENI IGRU**
- Pojavi se **QR kod + 4-slovni kod sobe**
- Svi ostali skeniraju QR s **mobitelima** ili upišu kod
- Svaki igrač bira lik iz roster-a (15 frajera)
- Kad ih je dovoljno, klikneš **POKRENI IGRU** na TV-u
- Kartice idu na velikom ekranu, glasanje na mobitelima
- **TV je pozornica, mobiteli su daljinski**

### 🔵 PRIDRUZI SE *(igrač se priključuje sobi)*
- Otvoriš link **na mobitelu**
- Upišeš kod sobe koji je host pokazao
- Biraš lik, ulaziš

### 🟢 LOKALNO *(jedan ekran, bez interneta)*
- Otvoriš link na **bilo čemu** (laptop, mobitel, tablet)
- Klikneš **LOKALNO (1 EKRAN)**
- Biraš broj igrača i likove
- **Sve se igra na istom uređaju** — dodajete ga okolo
- Glasanja su naizmjence: "MATIJA, glasaj!" → A/B → "PASKO, glasaj!" → ...
- **Ne treba internet** nakon prvog otvaranja (browser ga keširra)

---

## Što se događa u igri

1. **Setup** — biraš igrače i likove (Matija = mladoženja, Pasko = kum)
2. **3 runde**: ZAGRIJAVANJE → MOMACKA → SUDNJI DAN (svaka runda je jača)
3. **30 karata po rundi** — svaka karta je drugačiji izazov
4. **Mladoženja pije 2-4x više** od ostalih (POREZ MLADOŽENJE)
5. Na kraju → **JUTRO POSLIJE** scoreboard (tko je popio najviše)

### Vrste karata (13)

| Karta | Što se događa |
|-------|---------------|
| **JA NIKAD NISAM** | Tko jest, pije |
| **ISTINA** | Trenutni igrač odgovara ili pije |
| **IZAZOV** | Trenutni igrač radi izazov ili pije |
| **STO BI RADIJE** | Svi glasaju A/B, manjina pije |
| **TKO CE NAJPRIJE** | Svi glasaju za nekog, najviše glasova pije |
| **TKO U SOBI** | Trenutni igrač bira nekoga tko će piti |
| **KONTROVERZNO** | Glasanje ZA/PROTIV, manjina pije |
| **KATEGORIJE** | Nabrajate dok netko ne zaglavi |
| **NOVO PRAVILO** | Trenutni igrač izmišlja pravilo |
| **ODABERI PAJDASA** | Vežeš se s nekim — kad jedan pije, oba piju |
| **MLADOZENJA** | Mladoženja MORA. Svejedno pije. |
| **BOSS FIGHT** | 2 igrača se bore (kamen-papir-škare ili sl.) gubitnik pije |
| **KAOS KARTA** | Random ludilo — svi piju, šot, etc. |

---

## Admin kontrole *(samo na hostu/TV-u)*

Gore desno je gumb **Admin** — otvara panel sa svim kontrolama:

### TIJEK IGRE
- 🎴 **Vuci kartu** — ručno povuci kartu
- ⏭ **Sljedeci red (preskoci)** — ako se zaglavi, preskoči

### UPRAVLJANJE
- 👥 **Igraci (N)** — vidi sve igrače, izbaci nekog
- 🏠 **U predvorje** — natrag u lobby (svi gutljaji se brišu)
- 🔄 **Restartaj igru** — počni ispočetka
- 🏁 **Zavrsi → rezultati** — skoči na scoreboard
- ❌ **Izlaz iz igre** — obriši sobu i izlaz

### MUZIKA *(107 pjesama iz Paskove playliste)*
- ⏮ Prošla / ⏸ Pauza / ⏭ Sljedeća / 🔇 Mute
- Volume slider
- Auto-mijenja pjesme po rundama (chill → hard → metal)
- Naziv pjesme se scrolla ako je predugo

---

## Kontrole na mobitelima

Igrači na mobitelima imaju **karta-specifične gumbe**:

- **JA NIKAD NISAM** → "JESAM (PIJES)" / "NISAM"
- **ISTINA / IZAZOV** → "ODGOVORIO/URADIO" / "KUKAVICA - PIJEM"
- **STO BI RADIJE** → A / B
- **KONTROVERZNO** → ZA / PROTIV
- **TKO CE NAJPRIJE / TKO U SOBI / PAJDAS** → grid s likovima, klikneš lik
- **KATEGORIJE / KAOS / RULE / BOSS FIGHT** → "OK" gumb

Kad nije njegov red → "👀 Cekamo {ime}... Pogledaj TV"
Kad glasa → "✓ Glas poslan, pogledaj TV za rezultate"

---

## Kako spojiti na TV

### Najlakše opcije

1. **Smart TV browser** *(najlakše, bez kabela)* — otvoriš browser app na TV-u, ukucaš `matijamon-bachelor.vercel.app`, igraš direktno na TV-u
2. **Chromecast** — otvoriš link u Chrome-u na mobitelu, izbornik → Cast → odaberi TV
3. **AirPlay** — iPhone + Apple TV / kompatibilan TV → AirPlay tab
4. **HDMI kabel** — laptop → TV. Failsafe.

### Ako nema interneta na lokaciji
- Koristi **LOKALNO mod** — radi bez interneta nakon prvog otvaranja
- ILI hotspot s mobitela na laptop

---

## Znanje koje pomaže

- **Igrači mogu izaći i vratiti se** — soba pamti session, refresh ne briše napredak
- **Mladoženja pije za sve** — tax skupa s otprilike pola njihovog pijenja
- **PAJDAS sustav** — kad ti pajdas pije, ti pijes (i obrnuto)
- **Wake lock** — TV se ne gasi tokom igre
- **Auto-advance muzika** — kad pjesma završi, dolazi sljedeća automatski

## Ako se nešto zglaji

- **Karta zaglavi** → admin panel → ⏭ Sljedeci red
- **Igrač se odspojio** → admin → 👥 Igraci → izbaci ga
- **Muzika ne svira** → admin → muzika → ⏯ play, ili F5 i klikni POKRENI IGRU ponovo (browser blokira autoplay dok ne klikneš)
- **Sve je u kurcu** → ❌ Izlaz iz igre, otvori novu sobu

---

## Tehničke stvari *(za nerd-ove)*

- **Hosting:** Vercel (free tier), auto-deploy iz GitHub-a
- **DB:** Supabase (free tier) — Postgres + Realtime
- **Tech:** Next.js 16 + TypeScript + Tailwind
- **Source:** https://github.com/sinaluminous/matijamon-bachelor-web
- **Assets:** Sve iz Matijamon projekta — sprite-ovi, zvukovi, font, Paskova playlist (107 traka)

---

**Sve radi. Naroci pivu. Sretno tonight! 🍻**

*— Sina*
