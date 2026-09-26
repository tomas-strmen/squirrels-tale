# Veverička – Game Design Document (GDD) v1.3

> **Pracovný názov hry:** *Squirrel's Tale* (dočasný – finálny názov vybrať pred vydaním; nesmie pripomínať „Hero Tale“).
> **Stav:** v1.5, 26. 9. 2026. Zdroj: odpovede Tomasa v `docs/archiv/GDD-odpovede.md` (archív – pri rozpore platí tento dokument). Toto je jediná udržiavaná kópia GDD.
> **Súvisiace:** `claude/ROADMAP.md` (technológia, architektúra, etapy vydania), `claude/PROMPT-vyvoj.md` (ako má AI pracovať).

---

## 0. Ako čítať tento dokument

- Toto je **zdroj pravdy** o tom, *čo* je hra. *Ako* sa robí, hovorí ROADMAP a PROMPT-vyvoj.
- Značky rozsahu: **[MVP]** = patrí do prvej hrateľnej verzie, **[PO-MVP]** = hneď po MVP, **[NESKÔR]** = vzdialený plán.
- **Všetky čísla sú štartovacie.** V kóde budú v `data/balance.json` a ďalších dátových súboroch, nie natvrdo v kóde. Ladí sa v etape M20 (balans) a pri hraní.
- Zmena GDD: AI navrhne presnú zmenu (starý text → nový text), Tomas schváli, zapíše sa do **Changelogu** (kap. 25).
- Hra je **v angličtine**. V GDD sú názvy vo forme *English name (slovensky)*. ID v dátach sú anglické `snake_case`.

---

## 1. Vízia

**Pitch (1 veta):** Idle RPG, v ktorom malá veverička vypadne zo svojho domčeka, bojuje sa lesom plným hmyzu a zvierat a hľadá, kto zničil jej domov a kde je jej rodina – hra beží sama, ale kto sa pozerá a občas ťukne, postupuje o trochu rýchlejšie.

**Piliere:**
1. **Stály pocit postupu** – vždy viditeľný ďalší cieľ, žiadny týždňový grind; začiatok rýchly (prvý predmet z prvého moba, level do ~40 s).
2. **Loot ako v Diablo 2** – náhodné štatistiky, vzácnosti, sety, Magic Find, garantovaný progres (pity).
3. **Vrátenie v čase** – unikátna mechanika (ihličie času): vrátiť boj o 10 s, alebo znova zabiť bossa pre lepší loot.
4. **Rešpekt k hráčovi** – žiadne vyskakovacie reklamy, žiadny pay-to-win, žiadna dlhá regenerácia po smrti, nič sa potichu nestratí.
5. **Útulný svet s posolstvom** – od pomsty ľuďom k pochopeniu, že treba žiť v symbióze.

**Cieľovka:** dospelí fanúšikovia idle hier (napr. Hero Tale, Melvor Idle), ktorí hrajú v krátkych chvíľach.

**Typické sedenia, ktoré hra musí podporiť:**
- večer ~30 min: zobrať loot za deň, triediť, vylepšiť, posunúť sa, nastaviť veveričku „na noc“,
- 10-min prestávka v práci,
- hra beží na stole a hráč občas ťukne.

**Dĺžka:** hlavná línia celej hry ~1 mesiac pri 1–2 h denne; s endgame pol roka. **MVP** = prvá mapa (9 políčok) ≈ 3–5 dní bežného hrania.

**Inšpirácie:** Hero Tale (boj, mapa s políčkami, inventár, questy), Diablo 2 (vzácnosti, sety, MF, rozsahy štatistík), Lineage 2 (riskantné vylepšovanie), Melvor Idle (neskôr nebojové skilly), Cookie Clicker (motýlik = „golden cookie“).

**Čo nechceme:** vyskakovacie/automatické reklamy, pay-to-win, energiu/staminu, grind typu „500 pierok + 600 bobúľ“, dlhé čakanie po smrti.

---

## 2. Herné slučky

| Rytmus | Čo hráč robí / čo sa deje |
|---|---|
| **každých 2–3 s** | veverička a nepriateľ si automaticky vymieňajú údery (čísla poškodenia, crit, miss) |
| **každých ~8–12 s** | nepriateľ padne → XP, meny, občas predmet (hod kockou na vzácnosť) |
| **každých 10–20 s** (len keď je hra otvorená) | vyskočí **akcia** („Silný úder“ / „Uhni!“) – ťuknutie = malá výhoda |
| **každé 2–4 min** (otvorená hra) | preletí **motýlik** – ťuknutie = 60 s bonus |
| **každých pár minút** | level up → bod do stromu; nové políčko sa odomkne; výmena výbavy |
| **raz za sedenie** | obrazovka **„While you were away“**, triedenie lootu, obchodník, kováč, boss |
| **denne** | 3 denné úlohy, odmena za prihlásenie, nový tovar u obchodníka, reset cien vrátenia v čase |

**Slučka „večer“:** otvoriť → súhrn offline → roztriediť/rozobrať → vylepšiť u kováča → skúsiť bossa / nové políčko → nastaviť políčko na noc (kde to veverička „utiahne“).

---

## 3. Svet a príbeh

**Tón:** útulný, kreslený, mierne smutný začiatok, optimistický koniec. Dialógy krátke (1–3 vety), vtipné.

**Príbeh (celá hra):**
1. Veverička sa zobudí na zemi pod stromom – jej hniezdo je zničené, rodina preč.
2. Dedko Ježko (Old Hedgehog) ju naučí bojovať. Postupne sa skamaráti so zvieratkami.
3. Oslobodí mravce spod nadvlády Mravčieho kapitána → mravce jej pomáhajú.
4. Postupne zisťuje, že les vyrúbali **ľudia** (stroje, pne, odpadky) → chce sa pomstiť, postupuje k mestu, výzbroj z ľudských odpadkov (plechovka = helma).
5. **Záver:** pochopí, že násilím sa nič nevyrieši a treba žiť v **symbióze** – nájde rodinu.

**MVP pokrýva kroky 1–3** a náznak kroku 4 (Užovka na konci prezradí, že za tým sú „obri so stromožrútmi“ – ľudia s pílami; vpravo na mape je vidieť náznak mesta).

**NPC v MVP:**
| NPC | Kde | Úloha |
|---|---|---|
| Old Hedgehog (Dedko Ježko) | T1 | mentor, tutoriál, príbehové questy |
| Magpie (Straka) | T2 | **obchodník** – miluje ligotavé kamienky |
| Rhino (Nosorožík – chrobák) | úkryt, po T4 | **kováč** – vylepšovanie, rozoberanie, výmena |
| Ant Scout Tik (mravček Tik) | T4 → úkryt | po oslobodení mravcov – mravčia chodba |
| Old Frog (Stará žaba) | T6 | quest; [PO-MVP] predpoveď počasia |
| Wise Owl (Múdra sova) | T7 | príbeh, quest „ukáž sa mi v listovom sete“ |

---

## 4. Obrazovky a UI

- **Orientácia na šírku (landscape)** – zámer. Web verzia: 16:9, škáluje sa.
- Štýl: ako Hero Tale (ručne maľované). **V MVP sivé tvary / placeholdery**, grafika až v etape obsahu. Animácie: v MVP jednoduché (posun, blik, číslo poškodenia); plné sprite animácie [PO-MVP].
- Hudba a zvuky [PO-MVP].
- Všetky texty v `strings/en.json` (kľúč → text), nikdy priamo v kóde.

**Zoznam obrazoviek [MVP]:**
1. **Combat (políčko)** – hlavná obrazovka.
2. **Map** – 9 políčok + náznak mesta.
3. **Hideout (úkryt)** – samostatná obrazovka, rýchle tlačidlo z boja („uteč domov“).
4. **Inventory & Equipment** (+ truhlica, keď je hráč v úkryte).
5. **Skill Tree** (vizuálne skutočný strom).
6. **Merchant** (Straka), 7. **Blacksmith** (Nosorožík).
8. **Quests** (príbeh + denné + odmena za prihlásenie).
9. **While You Were Away** (súhrn offline).
10. **Boosts** (3 boosty, reklama / Premium), 11. **Store** (Premium).
12. **Settings** (pravidlá lootu, auto-jedlo, zvuk neskôr, reset hry).
13. **Dialog overlay** (NPC).
14. **Debug panel** (len vo vývoji: rýchlosť ×1/×4/×20, posun času, pridať predmety/meny, reset).

**HUD na obrazovke boja:**
```
[HP 5.0/5.0 ███████]  Lv 3  [XP ▓▓▓░░]          [● 12 pebbles] [● 8 seeds] [● 5 nuts] [✦ 3 needles]
                                        
     (veverička)          ← boj →          (nepriateľ)  HP ████
                     [bublina akcie]         
  ~motýlik~                                              tile: Ant Trail  12/30 ▸ next tile

[🫐 berry][🌰 seed][🥜 nut]   [Map] [Hideout] [Bag] [Tree] [Quests] [Boosts]
```

---

## 5. Pravidlá pre čísla

- **Dizajnové hodnoty (HP, poškodenie, armor, liečenie) majú najviac 1 desatinné miesto.** Začíname s 5.0 HP, mravec berie 0.2–0.3.
- **Percentá** (crit, dodge, MF, bonusy) sú celé čísla (napr. 3 %).
- **Interná reprezentácia:** celé čísla v **stotinách** (5.0 HP = 500) – kvôli percentuálnym bonusom a regenerácii bez chýb s desatinnými číslami. **Zobrazenie vždy zaokrúhlené na 0.1.** Výsledné poškodenie úderu sa zaokrúhli na 0.1 (min. 0.1 pri zásahu).
- **Náhoda:** jediný zdroj = `Rng` so seedom (deterministický). Potrebné pre testy, vrátenie v čase a offline výpočet.
- **Čas boja:** simulácia beží v pevných krokoch **100 ms** nezávisle od FPS (umožní zrýchlenie v debugu, snapshoty, headless testy).

---

## 6. Postava

### 6.1 Štatistiky
| Štatistika | Základ Lv1 | Rast | Strop | Odomknutie |
|---|---|---|---|---|
| Max HP | 5.0 | +0.5 / level | – | od začiatku |
| Regenerácia | 0.1 HP / 2 s | +3 % / level (relatívne) | – | od začiatku |
| Poškodenie | zo zbrane (bez zbrane 0.3–0.4) | – | – | od začiatku |
| Rýchlosť útoku | interval zbrane (napr. 2.0 s; bez zbrane 4.0 s) | % bonusy skracujú interval | min. interval 0.5 s | od začiatku |
| Armor | 0 | z výbavy | redukcia max 75 % | od začiatku |
| Presnosť (hit) | 85 % | +% zo skillu zbrane | 5–98 % | od začiatku |
| Crit šanca / Crit dmg | 0 % / ×1.5 | výbava, strom, skill | crit max 50 % | **quest Q3** |
| Magic Find (MF) | 0 % | výbava, strom, Premium | – | **quest Q4** |
| Dodge (uhnutie) | 0 % | výbava, strom | max 40 % | **quest Q7** |
| Stun šanca | 0 % | výbava, strom, skill | max 25 % | **quest Q8** |

- **Kým štatistika nie je odomknutá**, nezobrazuje sa, nepadá na predmetoch a uzly stromu pre ňu sú zamknuté. (Výnimka: fixná vlastnosť unikátneho predmetu, napr. Haluz s jablkom má stun vždy – „ochutnávka“.)

### 6.2 Level a XP
- **Žiadny strop levelov.**
- XP na ďalší level: `need(L) = round(10 × 1.4^(L−1))` → Lv1: 10, Lv2: 14, Lv3: 20, Lv5: 38, Lv10: 207, Lv15: 1111, Lv20: 5976.
- Za level: +0.5 max HP, +1 bod do stromu. **Každých 5 levelov** (5, 10, 15…) navyše **1 špeciálny bod**.
- Cieľ tempa (overené hrubou simuláciou, doladiť v M20): Lv2 ~40 s, Lv10 ~15 min, koniec MVP ~Lv18–21.

### 6.3 Smrť
- **Online (hra je otvorená):** strata **10 % aktuálneho postupu k ďalšiemu levelu** (10 % XP nazbieraného v aktuálnom leveli, napr. 20/38 → 18/38; level nikdy neklesne). Veverička sa objaví v úkryte (mravce ju odniesli), **plné HP za 10 s** a **zostane v úkryte** – hráč sám vyberie políčko na mape a stlačí *Find enemy* (kap. 7.1).
- **Offline:** smrť **nestojí XP**. Veverička sa zregeneruje v úkryte (10 s) a pokračuje na tom istom políčku. Na políčku, kde by offline umierala, zabíja **o polovicu pomalšie** – čas zabitia ×2 (napr. 10 s → 20 s), takže XP, predmety aj meny pribúdajú polovičným tempom (kap. 17.2). Súhrn po návrate ukáže loot, meny, XP, počet smrtí a čas regenerácie.
- Ak je hra otvorená, pred smrťou sa ponúkne **vrátenie v čase** (kap. 16).

---

## 7. Boj

### 7.1 Priebeh
- 1 vs 1 [MVP]. 1 vs 1–3 s voľbou cieľa [NESKÔR].
- Každý bojovník má časovač útoku (interval). Keď dobehne → útok.
- **Hľadanie nepriateľa:** po príchode na nové políčko hráč stlačí *Find enemy*; potom sa hľadá automaticky – po každom porazenom nepriateľovi beží bar hľadania 1.0 s. Tlačidlo *Peace!* hľadanie zastaví: veverička zostane na políčku a len regeneruje, kým hráč znova nestlačí *Find enemy*. *Peace!* počas boja boj **hneď ukončí** – nepriateľ odíde, **bez XP a lootu**.
- **Automatické prepínanie zbraní:** nepriateľ s `flying: true` → len diaľková zbraň; inak zbraň na blízko (ak nie je, diaľková; ak nie je ani tá, päste 0.3–0.4).

### 7.2 Vzorec úderu
```
hitChance = clamp(baseHit + hit% + skillHit − defenderDodge, 5 %, 98 %)
ak miss → "Miss"
raw  = roll(weaponMin, weaponMax)            // rovnomerne, krok 0.1
raw *= (1 + damage%) × weaponSkillMult × ammoMult (0.5 ak chýba munícia)
ak crit (šanca crit%) → raw *= (1.5 + critDmg%)
DR   = armor / (armor + 10)                  // max 0.75
final = max(0.1, round1(raw × (1 − DR)))
ak stun (šanca stun%) → cieľ má ďalší útok oneskorený o 1.5 s (boss 0.5 s), nesčítava sa
```
- `interval = baseInterval / (1 + attackSpeed%)`, min 0.5 s.
- Regenerácia tiká počas boja aj medzi súbojmi.

### 7.3 Munícia
- Diaľkové zbrane míňajú **1 oriešok na výstrel** (skill „strelné“ dáva šancu ušetriť, kap. 13.2).
- Keď oriešky dôjdu: prak strieľa **kamienky zo zeme**, luk **pohodené vetvičky** – **50 % poškodenia**, nekonečné.
- Hráč si sám určí, koľko orieškov chce držať (nastavenie „keep at least N nuts for food/trade“ – pod túto hranicu sa na streľbu nepoužijú).

### 7.4 Jedlo
| Jedlo | Lieči | Zdroj |
|---|---|---|
| Berry (bobuľa) | 0.3 | drop 10 % z nepriateľov |
| Seed (semienko) | 0.5 | mena |
| Nut (oriešok) | 1.0 | mena + munícia |

- **Auto-jedlo:** keď HP < prah (predvolene 40 %), zje jedlo podľa poradia (predvolene bobule → semienka → oriešky), cooldown 3 s. Nastaviteľné.
- **Rýchle tlačidlá** na HUD: zjesť ručne (rovnaký cooldown).

### 7.5 Aktívne hranie (len keď je hra otvorená)
- **Akcia** každých 10–20 s (náhodne), bublina 3 s: *Power Strike* (ďalší úder = istý crit ×2) alebo *Dodge!* (ďalší úder nepriateľa minie). Ignorovanie nič nestojí.
- **Motýlik** každé 2–4 min, viditeľný 5 s: ťuknutie = **60 s +20 % rýchlosť útoku**. Zadarmo, bez reklamy.
- **Cieľ:** aktívny hráč spolu max **+20 až +35 %** oproti čistému idle (overiť v M20).

### 7.6 Šampión (super mob) [MVP]
- 2 % šanca, že sa namiesto nepriateľa objaví *Champion*: ×3 HP, ×1.5 poškodenie, ×2 XP, **vždy padne predmet**, váhy vzácností rare+ ×10. Zlatý obrys.

### 7.7 Bossovia [MVP: 2]
- Boss sa odomkne po splnení počtu zabití na políčku → tlačidlo **„Challenge boss“**. Boj je automatický, ale **spúšťa ho hráč** a **nebojuje sa offline**.
- Po prehre sa hráč vráti na políčko (bez straty XP pri bossovi – je to skúška).
- Každý boss má špecialitu (tab. 8.3). Prvé zabitie = príbeh + istý unikátny predmet.

---

## 8. Mapa a nepriatelia

### 8.1 Mapa
- Jedna mapa s políčkami v biómoch. **Štart vľavo dole**, postup doprava hore. **Vpravo náznak mesta** (zamknuté, „Coming soon“ [NESKÔR]: ďalšia mapa).
- Postavička sa po mape nehýbe – klik na políčko = presun.
- Úkryt (strom s dutinou) je na mape viditeľný pri štarte; do úkrytu vedie aj rýchle tlačidlo.

```
                                   [T9 Snake Hollow]  ~~ [City (locked)]
                    [T7 Old Stump]  [T8 Thorn Thicket]
      [T4 Anthill]  [T5 Berry Bushes] [T6 Pond Edge]
[T1 Fallen Nest] [T2 Mossy Roots] [T3 Ant Trail]
  (Hideout tree)
```

### 8.2 Políčka [MVP]
| # | Políčko | Nepriatelia | Odomknutie ďalšieho | NPC / poznámka |
|---|---|---|---|---|
| T1 | Fallen Nest (Spadnuté hniezdo) | Worker Ant | 8 zabití (~1 min) | Dedko Ježko, tutoriál |
| T2 | Mossy Roots (Machové korene) | Worker Ant, Pill Bug | 15 zabití (~3 min) | Straka (obchod po Q2) |
| T3 | Ant Trail (Mravčia cestička) | Armed Ant, Worker Ant | 30 zabití + Lv 5 | Q3 (crit, prak) |
| T4 | Anthill (Mravenisko) | Armed Ant, Ant Soldier | 60 zabití → **boss Ant Captain** | po bossovi: kováč, mravce |
| T5 | Berry Bushes (Černicové kríky) | Beetle, Moth (letí) | 100 zabití + Lv 11 | Q5 (žaluďová helma) |
| T6 | Pond Edge (Pri jazierku) | Dragonfly (letí), Frog | 150 zabití | Stará žaba, Q7 (dodge) |
| T7 | Old Stump (Starý peň) | Centipede, Spider | 220 zabití + Lv 15 | Múdra sova, Q8 (stun, set) |
| T8 | Thorn Thicket (Tŕnie) | Wasp (letí), Shrew | 300 zabití | |
| T9 | Snake Hollow (Hadia jama) | Shrew, Wasp | 360 zabití → **boss Grass Snake** | koniec MVP |

### 8.3 Nepriatelia [MVP: 12 + 2 bossovia]
| ID | Meno | Tile | HP | Úder | Interval | Hit | Armor | Dodge | XP | Pozn. |
|---|---|---|---|---|---|---|---|---|---|---|
| worker_ant | Worker Ant (Mravec robotník) | 1–3 | 1.2 | 0.2–0.3 | 2.0 s | 65 % | 0 | 0 | 2 | |
| pill_bug | Pill Bug (Žižiavka) | 2 | 2.0 | 0.2–0.3 | 3.0 s | 65 % | 1.0 | 0 | 3 | tanky |
| armed_ant | Armed Ant (Ozbrojený mravec) | 3–4 | 2.5 | 0.3–0.5 | 2.8 s | 70 % | 0 | 0 | 4 | |
| ant_soldier | Ant Soldier (Mravec vojak) | 4 | 3.5 | 0.4–0.6 | 2.5 s | 70 % | 0.5 | 0 | 5.5 | |
| beetle | Beetle (Chrobák) | 5 | 4.5 | 0.5–0.7 | 2.8 s | 72 % | 1.0 | 5 % | 8 | padá Acorn Cap 20 % |
| moth | Moth (Mora) | 5 | 3.0 | 0.3–0.5 | 2.6 s | 72 % | 0 | 10 % | 7 | **letí** |
| dragonfly | Dragonfly (Vážka) | 6 | 4.0 | 0.4–0.6 | 1.8 s | 72 % | 0 | 15 % | 11 | **letí**, rýchla |
| frog | Frog (Žaba) | 6 | 6.0 | 0.6–0.9 | 3.0 s | 72 % | 0.5 | 0 | 11 | |
| centipede | Centipede (Stonožka) | 7 | 8.0 | 0.7–1.0 | 2.2 s | 75 % | 1.0 | 5 % | 15 | |
| spider | Spider (Pavúk) | 7 | 7.0 | 0.6–0.9 | 2.4 s | 75 % | 0.5 | 10 % | 15 | sieť: −10 % rýchlosť útoku hráča 5 s (každý 4. útok) |
| wasp | Wasp (Osa) | 8–9 | 7.0 | 1.0–1.4 | 2.0 s | 75 % | 0.5 | 15 % | 21 | **letí** |
| shrew | Shrew (Piskor) | 8–9 | 12.0 | 1.0–1.5 | 2.5 s | 75 % | 1.5 | 5 % | 21 | |
| **ant_captain** | **Ant Captain (Mravčí kapitán)** – boss | 4 | 25 | 0.5–0.8 | 2.5 s | 75 % | 1.5 | 0 | 40 | *Rally* každých 20 s: +30 % rýchlosť útoku na 6 s; pod 50 % HP *Shield Wall*: armor +2 na 5 s (každých 15 s) |
| **grass_snake** | **Grass Snake (Užovka)** – boss | 9 | 90 | 1.2–1.8 | 2.8 s | 78 % | 1.5 | 20 % | 200 | *Venom Bite* každých 15 s: jed 0.1 HP/s na 6 s; pod 50 % HP *Coil*: omráči veveričku na 1.5 s (každých 20 s) |

- Kontrola udržateľnosti (hrubá simulácia): na „svojom“ políčku s primeranou výbavou má byť regenerácia + jedlo ≥ prijaté poškodenie. Od T3 treba lepšiu výbavu/jedlo → to je prirodzená brzda postupu (nie počet zabití).

---

## 9. Predmety

### 9.1 Sloty
**[MVP]:** melee weapon, ranged weapon, head, body, legs, ring, amulet (7).
**[PO-MVP]:** shield, **tail** (zbraň pre aktívny útok chvostom).

### 9.2 Vzácnosti
| Vzácnosť | Farba | Násobok základných hodnôt | Afixy | Poznámka |
|---|---|---|---|---|
| Common | sivá | ×1.00 | 0 | |
| Uncommon | zelená | ×1.15 | 1 | |
| Rare | modrá | ×1.35 | 2 | |
| Unique | oranžová | ×1.60 | 2 + fixná vlastnosť | pomenované predmety (9.5) |
| Legendary | fialová | ×2.00 | 3 + legendárna črta | ľubovoľný základný predmet |
| Set | tyrkysová | ×1.40 | fixné + bonus setu | Leaf Guardian set |
| Mythic | červená | – | mení pravidlá hry | **[NESKÔR]** |

**Legendárne črty [MVP, 4 ks]:** *+3 levely skillu typu zbrane*, *crit lieči 0.1 HP*, *+20 % poškodenie proti letiacim*, *10 % šanca neminúť oriešok (sčíta sa)*.

### 9.3 Generovanie predmetu
1. Vyber základný predmet z drop tabuľky políčka (tier ≤ t a ≥ t−2).
2. Hoď na vzácnosť (9.6).
3. Každá hodnota: náhodne v rozsahu `base × rarityMult × (1 + 0.08 × upgradeLevel)`, zaokrúhlené na 0.1.
4. Afixy: náhodne z poolu (bez zamknutých štatistík, bez duplicít); hodnota podľa tieru `base × (1 + 0.35 × (tier − 1))`.

**Afixy [MVP] (rozsah pre tier 1):**
| Afix | Rozsah | Zamknutý do |
|---|---|---|
| +Max HP | +0.2–0.4 | – |
| +Armor | +0.1–0.2 | – |
| +Damage % | +3–6 % | – |
| +Attack speed % | +2–4 % | – |
| +Hit % | +1–3 % | – |
| +Regeneration % | +5–10 % | – |
| +Currency find % | +3–6 % | – |
| +Crit chance % / +Crit damage % | +1–3 % / +5–10 % | Q3 |
| +Magic Find % | +3–6 % | Q4 |
| +Dodge % | +1–2 % | Q7 |
| +Stun chance % | +1–2 % | Q8 |

### 9.4 Zoznam 30 predmetov [MVP]
| # | ID | Meno | Slot | Typ | Tier | Základ | Interval |
|---|---|---|---|---|---|---|---|
| 1 | sharp_twig | Sharp Twig (Špicatá vetvička) | melee | bodná | 1 | 0.3–0.5 | 2.0 s |
| 2 | pebble_club | Pebble Club (Kamenná palica) | melee | úderová | 1 | 0.4–0.7 | 2.6 s |
| 3 | thorn_dagger | Thorn Dagger (Tŕňová dýka) | melee | bodná | 3 | 0.6–0.9 | 1.8 s |
| 4 | acorn_mace | Acorn Mace (Žaluďový palcát) | melee | úderová | 5 | 1.0–1.5 | 2.6 s |
| 5 | rose_thorn_spear | Rose Thorn Spear (Kopija z ružového tŕňa) | melee | bodná | 7 | 1.3–1.9 | 2.1 s |
| 6 | apple_branch | **Apple Branch (Haluz s jablkom)** – unique | melee | úderová | 6+ | 1.4–2.1 | 2.8 s |
| 7 | captain_pike | **Ant Captain's Pike (Kapitánova kopija)** – unique | melee | bodná | 4 (boss) | 0.9–1.3 | 1.9 s |
| 8 | snake_fang | **Snake Fang (Hadí zub)** – unique | melee | bodná | 9 (boss) | 1.8–2.6 | 1.7 s |
| 9 | twig_slingshot | Twig Slingshot (Prak z vetvičky) | ranged | strelná | 3 | 0.3–0.5 | 2.2 s |
| 10 | reed_slingshot | Reed Slingshot (Trstinový prak) | ranged | strelná | 5 | 0.6–0.9 | 2.2 s |
| 11 | willow_bow | Willow Bow (Vŕbový luk) | ranged | strelná | 8 | 1.0–1.5 | 2.4 s |
| 12 | leaf_cap | Leaf Cap (Listová čiapka) | head | armor | 1 | 0.1–0.3 | |
| 13 | acorn_helmet | Acorn Helmet (Žaluďová helma) | head | armor | 5 | 0.5–0.8 | výmena u kováča |
| 14 | snail_shell_helm | Snail Shell Helm (Ulitová prilba) | head | armor | 7 | 0.9–1.3 | |
| 15 | leaf_vest | Leaf Vest (Listová vesta) | body | armor | 1 | 0.2–0.4 | |
| 16 | bark_armor | Bark Armor (Kôrové brnenie) | body | armor | 4 | 0.6–0.9 | |
| 17 | beetle_shell_armor | Beetle Shell Armor (Pancier z krovky) | body | armor | 8 | 1.2–1.7 | |
| 18 | leaf_leggings | Leaf Leggings (Listové nohavice) | legs | armor | 2 | 0.1–0.3 | |
| 19 | moss_pants | Moss Pants (Machové nohavice) | legs | armor | 4 | 0.4–0.6 | |
| 20 | bark_greaves | Bark Greaves (Kôrové chrániče) | legs | armor | 7 | 0.7–1.0 | |
| 21 | grass_ring | Grass Ring (Trávový prsteň) | ring | +HP | 2 | +0.3–0.6 HP | |
| 22 | dew_ring | Dew Drop Ring (Prsteň z rosy) | ring | +regen | 5 | +10–20 % | |
| 23 | amber_ring | Amber Ring (Jantárový prsteň) | ring | +crit | 8 | +2–4 % crit | |
| 24 | pebble_pendant | Pebble Pendant (Kamienkový prívesok) | amulet | +armor/+HP | 1 | +0.1–0.2 / +0.2 | |
| 25 | clover_charm | Clover Charm (Štvorlístok) | amulet | +MF | 4 | +5–10 % MF | |
| 26 | feather_charm | Feather Charm (Pierkový amulet) | amulet | +dodge | 6 | +2–4 % | |
| 27 | guardian_leaf_cap | Leaf Guardian's Cap | head | set | 3+ | 0.3–0.5 | |
| 28 | guardian_leaf_vest | Leaf Guardian's Vest | body | set | 3+ | 0.4–0.7 | |
| 29 | guardian_leaf_leggings | Leaf Guardian's Leggings | legs | set | 3+ | 0.3–0.5 | |
| 30 | guardian_leaf_charm | Leaf Guardian's Charm | amulet | set | 3+ | +0.5 HP | |

### 9.5 Unikátne predmety (fixné vlastnosti)
- **Apple Branch:** vždy +8 % stun (aj pred odomknutím stunu).
- **Ant Captain's Pike:** +15 % poškodenie proti mravcom. Istý drop pri prvom zabití Kapitána, potom 25 %.
- **Snake Fang:** +10 % crit šanca. Istý drop pri prvom zabití Užovky, potom 25 %.
- Keď hod padne na *unique*, ale na políčku nie je dostupný žiadny unikát → namiesto neho Rare s 3 afixmi.

**Set Leaf Guardian (Strážca listov):** 2 ks: +1.0 max HP · 3 ks: +10 % dodge (pred odomknutím dodge: +0.5 armor) · 4 ks: +15 % rýchlosť útoku a +20 % regenerácia.

### 9.6 Drop, hod kockou, Magic Find, pity
- **Šanca na predmet:** 4 % za bežné zabitie (cieľ Tomasa: ~100–150 predmetov za 6–8 h), šampión 100 %, boss 2 predmety.
- **Základné váhy vzácnosti:** Common 70 · Uncommon 22 · Rare 6.0 · Unique 0.9 · Set 0.8 (len T3+; pred T3 pripadne Common) · Legendary 0.3.
- Kontrola: pri ~4 000 zabitiach do T7 (vrátane farmenia) padne ~160 predmetov, z toho zo šampiónov (~80 × 10× váhy) ~6–10 kúskov setu + pity každých 1000 zabití → celý Leaf Guardian set je reálny okolo T7–T8.
- **Magic Find:** váhy Uncommon a Rare × (1 + MF/100); váhy Unique/Set/Legendary × (1 + MF_eff/100), kde `MF_eff = MF × 100 / (MF + 100)` (klesajúci účinok). Common = zvyšok do 100 (min. 0).
- **Hod kockou (vizuál):** k20 kocka sa zakotúľa, výsledok je určený vopred z tabuľky; animácia vyberie stenu, ktorá zodpovedá vzácnosti (1–14 common, 15–18 uncommon, 19 rare, 20 → druhá zlatá kocka pre unique/set/legendary). Počas offline sa kocky ukážu až v súhrne (len pre rare+).
- **Pity (garantovaný progres):** počítadlo zabití od posledného predmetu Unique/Set/Legendary. Pri **1000** je ďalší drop istý a aspoň Unique. Počítadlo je vidieť v UI („Lucky acorn: 734/1000“). Keystone stromu ho zníži na 800.

---

## 10. Inventár a triedenie

- **Inventár:** 20 slotov (úkryt: +5 ×3; Premium +10). Materiály, meny a jedlo sa **stackujú** a nezaberajú sloty (sú v „zásobách“).
- **Truhlica (úkryt):** 30 slotov (+10 ×3). Prístupná len v úkryte. **Zmysel truhlice:** bezpečný sklad – pravidlá triedenia ani hromadné akcie sa jej nikdy nedotknú; sem patria predmety na neskôr (kúsky setu, kandidáti na vylepšenie). Po oslobodení mravcov sem mravce nosia **pretečenie** z inventára.
- **Pravidlá podľa vzácnosti** (pre každú vzácnosť: *Keep / Salvage / Sell*). Predvolene: Common → Salvage, ostatné → Keep.
- **Checkbox „Keep only upgrades“:** predmet so skóre nižším ako nasadený v rovnakom slote sa automaticky rozoberie. Skóre = vážený súčet štatistík (váhy v `balance.json`).
- **Plný inventár:** nový predmet → (po odomknutí mravcov) do truhlice → ak je plná aj tá: Common/Uncommon sa automaticky rozoberú; **Rare a vyššie sa nikdy nestratia** (inventár môže prekročiť limit, s červeným upozornením).
- **Prvý návrat z idle (tutoriál):** hra ukáže, čo padlo a čo by prepadlo, **prvýkrát ponechá všetko zadarmo** a vyzve hráča nastaviť pravidlá. Pri ďalších návratoch: predmety, ktoré sa nezmestili (Common/Uncommon), sa dajú zachrániť **dobrovoľnou reklamou** (Premium: automaticky).
- **Ovládanie:** zamknúť predmet (ochrana), porovnanie s nasadeným (zelené/červené šípky), zoradenie (slot/vzácnosť/skóre), hromadné „Salvage all Common“, značka „New“.

---

## 11. Ekonomika

### 11.1 Meny [MVP]
| Mena | Na čo | Zdroj |
|---|---|---|
| Shiny Pebbles (ligotavé kamienky) | nákup/vylepšenie **zbraní**, reset stromu, rozšírenie truhlice | drop, predaj zbraní |
| Seeds (semienka) | nákup/vylepšenie **brnenia**, rozšírenie inventára, **jedlo** | drop, predaj brnenia |
| Nuts (oriešky) | nákup/vylepšenie **prsteňov a amuletov**, **munícia**, **jedlo** | drop, predaj šperkov, mravce |
| Time Needles (ihličie času) ✦ | vrátenie v čase (kap. 16) – prémiová mena | bossovia, denné úlohy, login, vzácny drop |

**Drop mien za zabitie (políčko t):** kamienky 35 % × ceil(t/2); semienka 35 % × ceil(t/2); oriešky 20 % × 1; bobuľa 10 %. Boss: 10 × t z každej. Ihličie: 0.03 % za zabitie (~1 za 8 h), Kapitán 3, Užovka 5.

### 11.2 Obchodník – Straka [MVP]
- Odomkne sa questom Q2. Tovar: **5 predmetov denne** (4 Common + 1 Uncommon) z odomknutých políčok.
- Cena predmetu tieru t: `V(t) = round(5 × 1.5^(t−1))` (t1: 5, t3: 11, t5: 25, t9: 128). Uncommon ×3.
- **Platí sa menou podľa slotu:** zbrane = kamienky, brnenie = semienka, šperky = oriešky. Rovnako **výkup**:
  Common 0.2 V · Uncommon 0.6 V · Rare 1.5 V · Unique 4 V · Set 3 V · Legendary 10 V (min. 1); +20 % za každé +1 vylepšenie.

---

## 12. Kováč – Nosorožík [MVP]

Odomkne sa po porazení Ant Captaina (úkryt). Tri služby:

### 12.1 Rozoberanie (salvage)
| Vzácnosť | Výťažok |
|---|---|
| Common | 1 Scrap (súčiastka) |
| Uncommon | 2 Scrap |
| Rare | 3 Scrap + 1 Fine Part (jemná súčiastka) |
| Unique | 2 Fine + 50 % Amber (jantár) |
| Set | 2 Fine + 25 % Amber |
| Legendary | 3 Fine + 1 Amber |
- **Magic Find pri rozoberaní:** šanca `10 % × (1 + MF/100)` na +1 kus materiálu o stupeň vyššie.
- Rozoberanie (auto aj ručné) funguje od začiatku; kováč pridá vylepšovanie a výmenu.

### 12.2 Vylepšovanie (+1 až +10)
- Každé +1 = +8 % základných hodnôt predmetu. Mena podľa slotu = `V(tier)/2` × stupeň.
| Stupeň | Materiál | Šanca na rozbitie |
|---|---|---|
| +1 | 3 Scrap | 0 % |
| +2 | 5 Scrap | 0 % |
| +3 | 8 Scrap + 1 Fine | 0 % |
| +4 | 10 Scrap + 2 Fine | 0 % |
| +5 | 4 Fine | 0 % (posledné bezpečné) |
| +6 | 5 Fine + 1 Amber | 15 % |
| +7 | 6 Fine + 1 Amber | 25 % |
| +8 | 8 Fine + 2 Amber | 35 % |
| +9 | 10 Fine + 2 Amber | 45 % |
| +10 | 12 Fine + 3 Amber | 55 % |
- **Rozbitie** = predmet sa rozpadne na materiál (ako pri rozoberaní). Pred pokusom nad +5 hra zobrazí šancu a varovanie.

### 12.3 Výmena (malé množstvá, žiadny grind)
- **10 Acorn Caps → Acorn Helmet** (aspoň Uncommon). Acorn Cap padá z Beetle (20 %). Ďalšie výmeny [NESKÔR] (napr. 10 plechoviek → Tin Can Helmet v meste).

---

## 13. Strom schopností a zbraňové skilly

### 13.1 Strom (30 uzlov) [MVP]
- Vizuál: **skutočný strom** – kmeň v strede, 3 vetvy. Každý uzol = 1 bod (bežné) alebo 1 špeciálny bod (keystone ★). Uzol sa dá kúpiť, ak je kúpený predchádzajúci na vetve.
- **Reset:** za kamienky `10 × level`.

| Vetva | Uzly (efekt každého) | Keystone ★ |
|---|---|---|
| **Thorn (útok)** – 9 + ★ | +5 % poškodenie ×3 · +3 % rýchlosť útoku ×2 · +2 % crit ×2 (Q3) · +10 % crit dmg ×1 (Q3) · +2 % stun ×1 (Q8) | **Wild Squirrel:** +15 % poškodenie, −10 % armor |
| **Bark (obrana)** – 9 + ★ | +0.5 max HP ×3 · +0.2 armor ×2 · +10 % regenerácia ×2 · +2 % dodge ×2 (Q7) | **Thick Bark:** po prijatí úderu 10 % šanca zablokovať ďalší |
| **Acorn (šťastie)** – 9 + ★ | +5 % MF ×3 (Q4) · +5 % meny ×2 · +5 % XP ×2 · +10 % šanca ušetriť oriešok ×1 · +30 min offline strop ×1 | **Golden Acorn:** pity 1000 → 800 |

- Koniec MVP (~Lv 18–21) = ~20 bodov + 3–4 špeciálne → hráč **musí voliť** (spolu 27 bežných uzlov).

### 13.2 Zbraňové skilly [MVP]
- Typy v MVP: **Pierce (bodné), Blunt (úderové), Ranged (strelné)**. [PO-MVP]: Slash (sečné).
- XP skillu: +1 za každý zásah (aj offline, odhadom). `need(s) = round(10 × s^1.5)`.
- Efekt levelu s:
  - poškodenie × `(1 + 0.02 × (s − 1))` → s = 51: ×2.0 (**Expert**, titul),
  - presnosť +0.3 % / level (max +15 %),
  - **navyše podľa typu:** Pierce +0.1 % crit / level (po Q3) · Blunt +0.1 % stun / level (po Q8) · Ranged +0.5 % / level šanca neminúť oriešok (max 50 %).

---

## 14. Questy

### 14.1 Príbehové questy [MVP]
| ID | NPC / miesto | Úloha | Odmena |
|---|---|---|---|
| Q1 | Dedko Ježko, T1 | Poraz 5 Worker Ants | Leaf Cap, tutoriál inventára |
| Q2 | Straka, T2 | Prines 5 ligotavých kamienkov | odomkne obchod |
| Q3 | Dedko Ježko, T3 | Poraz 20 Armed Ants | **odomkne Crit**, Twig Slingshot |
| Q4 | T4 | Poraz Ant Captain | oslobodené mravce (mravčia chodba), **kováč**, **odomkne MF**, +30 min offline strop, 3 ✦ |
| Q5 | Kováč | Prines 10 Acorn Caps | Acorn Helmet, odomkne vylepšovanie |
| Q6 | Mravček Tik, úkryt | Zachráň mravčekov: poraz 50 nepriateľov na T5 | ants find nuts (1 oriešok / 10 min, aj offline) |
| Q7 | Stará žaba, T6 | Poraz 15 Dragonflies | **odomkne Dodge** |
| Q8 | Múdra sova, T7 | „Show me you wear the Leaf Guardian set“ – nasaď **2 kusy** setu | **odomkne Stun** |
| Q8b | Múdra sova, T7 (voliteľný) | nasaď **celý** Leaf Guardian set (4 ks) | 3 ✦, titul „Leaf Guardian“ |
| Q9 | T9 | Poraz Grass Snake | koniec MVP (dialóg o ľuďoch), +30 min offline strop, 5 ✦, mesto viditeľné |

> Poznámka: Q8b (celý set) je zámerne dlhší, voliteľný cieľ – nebráni postupu.

### 14.2 Denné úlohy [MVP]
- 3 denne z poolu, **reset o polnoci miestneho času** (chránené proti posunu hodín, kap. 17.3).
- Pool: poraz N nepriateľov · poraz N konkrétneho typu · rozober N predmetov · zjedz N jedla · predaj N predmetov · splň N aktívnych akcií.
- Odmena: meny podľa najvyššieho políčka; **všetky 3 = 1 ✦**.
- **Týždenné úlohy** [PO-MVP].

### 14.3 Odmena za prihlásenie [MVP]
- 7-dňový cyklus: 5 semienok · 5 kamienkov · 3 oriešky · 10 semienok · 10 kamienkov · 5 orieškov · 2 ✦.
- Vynechaný deň cyklus **neresetuje** (pokračuje sa ďalším dňom) – zhovievavé.

---

## 15. Úkryt (Hideout) [MVP]

- Samostatná obrazovka (dutina v strome). Rýchle tlačidlo z boja („Flee home“ – útek z boja bez straty XP).
- Obsah: posteľ (respawn), **truhlica**, kováč (po Q4), mravčia chodba (po Q4), vylepšenia.

| Vylepšenie | Efekt | Cena |
|---|---|---|
| Bigger Hollow I/II/III | inventár +5 | 30 / 90 / 250 semienok |
| Chest Expansion I/II/III | truhlica +10 | 30 / 90 / 250 kamienkov |
| Ant Tunnel (po Q4) | mravce nosia pretečenie do truhlice | zadarmo |
| Nut Pantry (po Q6) | mravce nájdu 2 oriešky / 10 min namiesto 1 | 50 orieškov |

- [NESKÔR]: vzhľad úkrytu, nápisy (whales), pets, nebojové skilly (zásoby, kutilstvo, varenie).

---

## 16. Vrátenie v čase (Time Needles) [MVP]

**Hlavná unikátna mechanika.** Funguje len keď je hra otvorená (nie offline).

- **Snapshoty:** stav boja sa ukladá každých 0.5 s, drží sa posledných 10 s (20 snapshotov).
- **A) Vrátenie pred smrťou:** keď HP klesne na 0, hra zastaví boj a 5 s ponúka *„Rewind time? (cost ✦)“*. Po vrátení je boj **pozastavený** s voľbami: *Continue* · *Eat* · *Flee home* (bez straty XP). Po vrátení sa použije **nová vetva náhody** (iný seed), aby sa neopakoval rovnaký priebeh.
- **B) Nový loot z bossa:** po zabití bossa a zobrazení lootu tlačidlo *„Rewind & fight again“* – boj sa vráti ~10 s pred posledný úder (boss s málo HP), nový seed, zobrazený loot sa zruší. Treba bossa doraziť znova.
- **Cena rastie** (reset denne o polnoci):
  - A) 1, 2, 4, 8, 16… ✦ za každé ďalšie použitie v daný deň,
  - B) 3, 6, 12… ✦ za toho istého bossa v daný deň,
  - [PO-MVP] špeciálne/eventové bossy ×2.
- **Zdroje ✦:** tutoriál 3, bossovia (3 / 5), denné úlohy (1/deň), login 7. deň (2), achievementy [PO-MVP], vzácny drop (~1 za 8 h). **Nákup ✦ za peniaze [PO-MVP]** – len malé balíčky; rastúca cena zabraňuje pay-to-win.

---

## 17. Offline progres [MVP]

### 17.1 Strop
- Základ **6 h**. +30 min za Q4, +30 min za Q9, +30 min uzol stromu → bez platenia **max 8 h** (ďalšie zdroje: achievementy, legendárne predmety [PO-MVP]). Premium +1 h (max 9 h).

### 17.2 Výpočet (pri otvorení hry)
1. `offline = clamp(now − lastSaved, 0, cap)` (kap. 17.3).
2. **Farm políčko:** vždy políčko, na ktorom hráč veveričku nechal. V režime *Peace!* sa offline nebojuje – veverička len regeneruje.
   - Udržateľné = `regen za zabitie + dostupné jedlo ≥ očakávané prijaté poškodenie`. Jedlo sa míňa podľa pravidiel auto-jedla.
   - **Neudržateľné políčko:** výpočet odhadne počet smrtí; každá smrť = 10 s regenerácie v úkryte, **bez straty XP**. Čas zabitia (TTK z bodu 3) sa **zdvojnásobí** (napr. 10 s → 20 s) → polovičné tempo zabití, a teda aj XP, predmetov a mien.
3. Očakávaný čas zabitia (TTK) z očakávaného DPS (zásah, crit, armor, munícia) + 1 s pauza → `kills = floor(offline / TTK)`.
4. Pre každé zabitie: XP, meny, skill XP (očakávané zásahy), **hod na loot** (Rng so seedom), pravidlá triedenia, mravce (pretečenie, oriešky), pity.
5. Bossovia sa offline nebojujú; aktívne akcie, motýlik a boosty offline neplatia (offline = 100 % čistého idle tempa).
6. Výsledok → obrazovka **„While You Were Away“**: čas, zabitia, XP/level, meny, **zoznam nových predmetov (rare+ s animáciou kocky)**, čo sa rozobralo/predalo, čo prepadlo (+ ponuka reklamy / zadarmo prvýkrát), minuté jedlo a oriešky, **počet smrtí a čas strávený regeneráciou v úkryte**.

### 17.3 Ochrana proti posúvaniu hodín
- Ukladá sa `maxSeenTime` (najvyšší videný čas). Ak `now < maxSeenTime − 5 min` → offline = 0, nič sa nepripíše a `maxSeenTime` sa nemení.
- Denné resety (úlohy, ceny ✦, login, obchod) sa počítajú podľa `maxSeenTime` → vrátenie hodín dozadu nič nedá. Posun dopredu obmedzuje strop 6–8 h.

---

## 18. Boosty, reklamy, Premium

### 18.1 Boosty za reklamu [MVP – s mock reklamou]
| Boost | Efekt | Za 1 reklamu | Strop |
|---|---|---|---|
| Nectar (Nektár) | +50 % XP | +30 min | 2 h |
| Clover (Štvorlístok) | +50 % MF | +30 min | 2 h |
| Magpie's Favor (Priazeň straky) | +50 % meny | +30 min | 2 h |
- Čas boostu **ubieha len keď je hra otvorená** (nie offline) → pri 30-min hraní hráč reálne pozrie max ~3 reklamy.
- Reklamy **len na vyžiadanie hráča** (tlačidlo). **Žiadne interstitial / automatické reklamy.** Žiadne reklamy v prvých ~10 min hry.
- Ďalšie rewarded miesto: záchrana predmetov, ktoré prepadli (kap. 10).
- Mäkký denný limit: 12 reklám.

### 18.2 Premium [MVP – mock nákup; skutočný v etape monetizácie]
- **Jednorazový nákup**, navrhovaná cena **3,99 €** (overiť pred vydaním; Hero Tale ~5 USD).
- Efekty: **bez reklám** (boosty a záchrana predmetov na ťuknutie, bez videa), +10 % XP, +10 % MF, +1 h offline strop, +10 slotov inventára.
- Obsah Premium sa **doladí po MVP** podľa hrateľnosti.

### 18.3 [NESKÔR]
- **Mythical Premium** (pre whales): +10 % XP navyše a **ovládanie počasia**.
- Balíčky ✦, vlastné nápisy na zbraň/dom/brnenie, kozmetika (až keď sa ukáže, že má zmysel).

---

## 19. Uloženie hry [MVP]

- **Len v telefóne** (web: `localStorage`/IndexedDB cez rozhranie `Storage`; Android: Capacitor Preferences/Filesystem). Cloud save cez Google Play Games [PO-MVP].
- **Jeden JSON objekt** (aby sa neskôr dal celý poslať do cloudu, limit 3 MB):
  `{ version, createdAt, savedAt, maxSeenTime, rngState, player, equipment, inventory, chest, stash (meny/materiály/jedlo), tiles, quests, daily, tree, weaponSkills, boosts, settings, flags, stats, pity }`
- `version` + **migrácie** (starý save sa vždy dá načítať). Autosave každých 30 s, pri pauze/zatvorení a po dôležitej akcii. **2 sloty** (aktuálny + predchádzajúci) pre prípad poškodenia.
- Export/import save ako text (debug + podpora hráčov).

---

## 20. Technická architektúra (doplnok k ROADMAP)

Technológia podľa ROADMAP: **TypeScript + Phaser + Vite**, Capacitor pre Android, Vitest + Playwright, GitHub Actions.

```
src/core/          # čistá logika, bez Phaseru, 100 % testovateľná
  numbers/         # hodnoty v stotinách, zaokrúhľovanie, formátovanie
  rng/             # seedovaný generátor, vetvenie seedu
  clock/           # čas, maxSeenTime, denné resety
  stats/           # skladanie štatistík (level, výbava, strom, skilly, boosty, set)
  combat/          # simulácia boja v krokoch 100 ms, udalosti (hit, miss, crit, death)
  rewind/          # snapshoty, vrátenie, ceny
  items/ loot/     # generovanie predmetov, vzácnosti, MF, pity, afixy
  inventory/       # inventár, truhlica, pravidlá triedenia, skóre
  economy/         # meny, obchod, ceny
  blacksmith/      # rozoberanie, vylepšovanie, výmena
  progression/     # XP, levely, smrť, odomykanie štatistík
  skills/          # strom + zbraňové skilly
  map/             # políčka, odomykanie, udržateľnosť
  quests/          # príbeh, denné, login
  offline/         # offline výpočet → súhrn
  boosts/          # boosty, aktívne akcie, motýlik
  save/            # serializácia, verzie, migrácie
src/game/          # Phaser scény a UI (len zobrazuje, volá core cez API/udalosti)
src/platform/      # Ads, Store, Storage (web mock | Android)
data/              # enemies, tiles, items, affixes, rarities, skilltree, quests, dialogues, balance (.json + zod schémy)
strings/en.json    # všetky texty
tools/sim/         # headless simulácia tempa (npm run sim) → tabuľka čas/level/políčko
```
- Moduly komunikujú cez **verejné API a event bus**. Každý modul má README (čo robí, API, závislosti).
- Testy: unit (core), validácia dát (odkazy, rozsahy), headless simulácia boja, Playwright smoke (hra sa načíta, prejde menu, screenshot).
- **Debug nástroje od začiatku:** rýchlosť ×1/×4/×20, posun času (test offline), pridanie predmetov/mien, reset save.

---

## 21. Rozsah MVP – kontrolný zoznam

**V MVP:** 9 políčok mapy + úkryt · boj 1v1 (hit/miss/crit/armor/stun/dodge) · 12 nepriateľov + 2 bossovia + šampión · automatické prepínanie zbraní, munícia · jedlo (auto + rýchle tlačidlá) · XP/levely bez stropu, smrť · 7 slotov výbavy, 30 predmetov, vzácnosti (bez mythic), afixy, set, 3 unikáty, legendárne črty · hod kockou, MF, pity · inventár + truhlica + pravidlá triedenia + „keep only upgrades“ · 3 meny + ihličie · obchodník · kováč (rozoberanie, vylepšovanie +1…+10, výmena) · strom 30 uzlov · 3 zbraňové skilly · 9 príbehových questov + denné úlohy + login · úkryt s vylepšeniami a mravcami · **vrátenie v čase** · offline progres + „While You Were Away“ + ochrana hodín · aktívne akcie + motýlik · 3 boosty (mock reklama) · Premium (mock nákup) · lokálny save s migráciami · angličtina v `en.json` · sivá grafika / placeholdery.

**Nie v MVP:** grafika a animácie (etapa obsahu), zvuk, mythic, štít a chvost, aktívne skilly, achievementy, bestiár, týždenné úlohy, počasie, pets, nebojové skilly, špeciálny boss „% poškodenia“, eventový boss, 1v3, rebirth, druhá mapa/mesto, cloud save, Mythical Premium, kozmetika, web statusy, opotrebenie výbavy.

---

## 22. Plán výroby – etapy MVP

**Princíp:** každá etapa = **1–3 pracovné sedenia** (AI naprogramuje, Tomas za 20–40 min otestuje v prehliadači a schváli). Každá etapa končí niečím, čo sa dá **vidieť a vyskúšať**, a nerozbije predchádzajúce (testy + CI). Poradie rešpektuje závislosti. Väzba na ROADMAP: M0 = etapa 1 (kostra), M1–M9 = etapa 2 (prototyp core loopu – „je to zábava?“), M10–M20 = etapa 3 (systémy riadené dátami).

| Etapa | Cieľ | Hotové keď… | Ako otestuješ (Tomas) |
|---|---|---|---|
| **M0 Kostra** | repo, Vite+TS+Phaser, Vitest, Playwright smoke, CI, CLAUDE.md, web deploy (GitHub Pages), landscape scéna | CI zelené, odkaz funguje na mobile | otvoríš link v mobile na šírku, vidíš štvorček/nadpis |
| **M1 Základy core** | `numbers`, `rng`, `clock`, event bus, načítanie dát so zod schémami, `en.json`, debug panel | unit testy, neplatné dáta = chyba testu | debug panel ukáže načítané nepriateľov a texty |
| **M2 Boj** | simulácia 1v1 (100 ms kroky), hit/miss, armor, poškodenie, HP bary, čísla, Worker Ant v slučke, rýchlosť ×1/×4/×20 | headless test: 100 bojov deterministicky rovnaký výsledok pri rovnakom seede | pozeráš sivú veveričku vs. mravca, zrýchliš |
| **M3 Progres** | XP, levely, regenerácia, smrť → úkryt (placeholder, regenerácia 10 s) → hráč vyberie políčko, strata XP | testy XP krivky a smrti | level do ~40 s, necháš ju umrieť (debug) |
| **M4 Predmety** | základné predmety, vzácnosti, afixy, drop 4 %, hod kockou (jednoduchá animácia), MF, pity, skladanie štatistík z výbavy | test distribúcie vzácností (10 000 hodov) | vidíš padať predmety s farbami a kockou |
| **M5 Inventár a výbava** | 20 slotov, 7 slotov výbavy, nasadiť/zložiť, porovnanie, zamknutie, zoradenie, stack zásob | testy inventára | nasadíš lepší meč a vidíš rýchlejšie zabíjanie |
| **M6 Mapa** | 9 políčok, odomykanie (zabitia/level/boss/quest), presun, nepriatelia podľa políčka, udržateľnosť | test pravidiel odomykania | prejdeš T1 → T3 |
| **M7 Meny, jedlo, diaľkový boj** | drop mien, jedlo + auto-jedlo + rýchle tlačidlá, diaľkové zbrane, munícia + náhradné kamienky, letiaci nepriatelia, auto-prepínanie | testy munície a jedla | na T5 veverička sama prepne na prak |
| **M8 Save** | save/load, verzie, migrácie, autosave, 2 sloty, export/import, ochrana hodín | test migrácie v1→v2, poškodený save | zavrieš a otvoríš hru, progres zostal |
| **M9 Offline + súhrn** | offline výpočet, strop 6 h, smrti offline (bez straty XP, čas zabitia ×2), „While You Were Away“, pravidlá vzácností, „keep only upgrades“, tutoriál prvého návratu | test: 6 h offline ≈ očakávané hodnoty | debug posun času o 3 h → súhrn |
| **M10 Obchodník** | Straka, Q2, denný tovar, nákup/predaj podľa meny slotu | testy cien | kúpiš/predáš predmety |
| **M11 Strom schopností** | 30 uzlov, body, špeciálne body, reset, vizuál stromu (jednoduchý) | testy efektov uzlov | minieš body a vidíš zmenu štatistík |
| **M12 Zbraňové skilly + odomykanie štatistík** | 3 skilly, XP za zásah, efekty, zamknuté štatistiky (crit/MF/dodge/stun) | testy skillov | vidíš rásť „Pierce 5“ |
| **M13 Questy** | dialógový systém, 9 príbehových questov, denné úlohy, login odmena | testy questov a resetov | prejdeš Q1–Q3 s dialógmi |
| **M14 Bossovia + šampión** | Ant Captain, Grass Snake so špecialitami, tlačidlo Challenge, šampión, unikáty | testy špecialít | porazíš Kapitána |
| **M15 Úkryt** | obrazovka úkrytu, truhlica, vylepšenia, mravčia chodba, mravce nosia pretečenie a oriešky | testy pretečenia | uložíš predmety do truhlice |
| **M16 Kováč** | rozoberanie s MF, vylepšovanie +1…+10 s rozbitím, výmena Acorn Helmet | testy šancí a cien | vylepšíš meč na +6 a riskneš |
| **M17 Vrátenie v čase** | snapshoty, vrátenie pred smrťou, nový loot z bossa, rastúce ceny, nová vetva seedu | test: po vrátení iný priebeh, správne ceny | vrátiš čas pred smrťou a utečieš |
| **M18 Aktívne hranie + boosty** | bubliny akcií, motýlik, panel boostov, mock reklama (tlačidlo „simulovať reklamu“), časovače len online | testy stropov a časovačov | ťukáš na motýlika, zapneš boost |
| **M19 Monetizácia (mock)** | rozhrania `Ads`/`Store`, Premium mock nákup a efekty, záchrana predmetov za reklamu | testy efektov Premium | „kúpiš“ Premium, reklamy zmiznú |
| **M20 Balans a playtest** | `npm run sim` (tempo celého MVP), doladenie `balance.json`, oprava chýb, polish | sim: T1 ~1 min, T2 ~3 min, aktívny bonus ≤ 35 %, ~100–150 predmetov / 8 h | hráš 3–5 dní a zapisuješ pocity |

**MVP hotové.** Ďalej podľa ROADMAP etapy 4–8 a backlogu nižšie.

---

## 23. Po MVP – backlog (poradie orientačné)

1. **Obsah a grafika** (ROADMAP etapa 4): grafika v štýle Hero Tale (AI/grafik, `CREDITS.md`), sprite animácie, zvuk a hudba, menu, nastavenia.
2. **Mobil** (etapa 5): Capacitor Android, dotyk, výkon, režim „na stole“ (šetrič batérie), pauza pri prepnutí appky.
3. **Monetizácia skutočná** (etapa 6): AdMob rewarded, Google Play Billing (Premium), GDPR súhlas, obnova nákupov.
4. **Google Play** (etapa 7): uzavretý test (12+ testerov, 14 dní), vydanie.
5. **Zbierky:** achievementy (menej, zmysluplné: listový set, +7, boss bez jedla/brnenia, 137 mravčekov, 9 pierok, skryté), bestiár, zbierka setov, Play Games achievementy.
6. **Týždenné úlohy.**
7. **Počasie:** automatický cyklus (deterministický podľa času → funguje aj offline), nepriatelia len pri určitom počasí (dážďovky v daždi), predpoveď u Starej žaby.
8. **Aktívne skilly + štít + chvost** (útok chvostom, trojitý útok, cooldowny).
9. **Pets** (roháč, motýľ, chrobáčiky).
10. **Nebojové skilly:** zásoby (zber cez mravce), kutilstvo (vylepšovanie/opravy), varenie.
11. **Špeciálny boss „% poškodenia“** a **denný/týždenný eventový boss** (len aktívne, ✦ drahšie).
12. **Mythic predmety** (menia pravidlá: zobák jastraba = nikdy nemineš; helma = nepadajú common).
13. **Cloud save** (Google Play Games Saved Games).
14. **Druhá mapa – mesto**, výzbroj z odpadkov, boj s ľuďmi, **rebirth** (reset všetkého, zostane „znalosť“), príbehový koniec (symbióza).
15. **Mythical Premium**, balíčky ✦, nápisy, kozmetika; web statusy po dohraní; Steam/iOS; 1 vs 1–3 s voľbou cieľa; opotrebenie výbavy (ak sa osvedčí).

---

## 24. Otvorené otázky (rozhodnúť neskôr)

- Premium +10 % XP/MF a Mythical +XP/počasie – overiť pri testeroch, či to nepôsobí ako pay-to-win.
- Finálny názov hry.
- Presné čísla (všetko v kap. 6–18) – ladenie v M20 a pri hraní.
- Šanca na kúsky setu – overiť v M20, či je celý set dosiahnuteľný okolo T7–T8.
- Cena Premium a (neskôr) balíčkov ✦.
- Zlato, gemy, šišky ako ďalšie meny – až s mestom / neskôr?

---

## 25. Changelog

| Verzia | Dátum | Zmena |
|---|---|---|
| 1.0 | 2026-09-25 | Prvá verzia z odpovedí Tomasa (65 otázok + upresnenia). |
| 1.1 | 2026-09-26 | 7.1: tlačidlá *Find enemy* a *Peace!* namiesto automatickej pauzy 1.0 s medzi nepriateľmi. 6.1: interval útoku bez zbrane 3.0 s. 8.3: Worker Ant interval 3.0 s → 2.0 s. |
| 1.2 | 2026-09-26 | 7.1: *Peace!* počas boja boj hneď ukončí (bez XP a lootu). 6.3: online smrť → úkryt, regenerácia 10 s, hráč sám vyberie políčko; zrušený auto-návrat a auto-ústup po 3 smrtiach; offline smrť bez straty XP. 17.2: offline sa farmí vždy na zvolenom políčku (v *Peace!* sa nebojuje), na neudržateľnom políčku 50 % XP a predmetov; súhrn ukáže smrti a čas regenerácie. 22: M3 a M9 upravené. |
| 1.3 | 2026-09-26 | 6.3: strata pri smrti = 10 % aktuálneho postupu v leveli (nie 10 % potrebného XP). 6.3/17.2: „o polovicu pomalšie“ offline = čas zabitia ×2 (polovičné XP, predmety aj meny); súhrn ukáže loot, meny, XP, smrti a regeneráciu. |
| 1.4 | 2026-09-26 | 6.1: interval útoku bez zbrane 3.0 s → 4.0 s (vyváženie tempa M0.1 boja). |
| 1.5 | 2026-09-26 | 6.1/7.1: poškodenie bez zbrane 0.2–0.3 → 0.3–0.4 (Tomas, M2). |
