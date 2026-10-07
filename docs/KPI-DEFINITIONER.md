# KPI-definitioner

Dette dokument beskriver præcist, hvordan hvert tal på dashboardet beregnes.
Alle justerbare valg ligger i **`config/kpi.config.ts`** (og visningsindstillinger i `.env`).
Beregningerne ligger som rene, enhedstestede funktioner i `server/kpi/`.

> **Status:** Definitionerne er foreløbige og bygget mod demodata. Punkter markeret **⚠ Afventer** skal bekræftes, når sagssystemets skema og e-conomic-opsætningen er gennemgået (se `docs/MANGLER-I-SAGSSYSTEMET.md`).

## Fælles regler

| Begreb | Definition | Konfiguration |
|---|---|---|
| Tidszone | Alle datoer og perioder regnes i dansk tid (Europe/Copenhagen), inkl. sommertid. | `TZ` i `.env` |
| Uge | ISO 8601: mandag 00:00 til søndag 24:00. Uge 1 er ugen med årets første torsdag. | — |
| I dag / Denne uge / Denne måned | Fra periodens start **til nu**. | — |
| Forrige tilsvarende periode | Standard **"til dato"**: samme del af forrige periode. Onsdag kl. 14 sammenlignes med onsdag kl. 14 i forrige uge, og den 7. med den 7. i forrige måned. Det er fair midt i en periode. Alternativ: hele forrige periode. | `sammenligning` |
| Måned med færre dage | Den 31. marts sammenlignes med 1.–28. februar (klemmes til sidste dag). | — |
| Åben sag | Status er **ikke** en af de lukkede statusser. Der skelnes ikke mellem store og små bogstaver. ⚠ Afventer: jeres liste over statusser. | `lukkedeStatusser` |
| Lukket sag | Status er en lukket status **og** sagen har en lukkedato. En sag med lukket status uden lukkedato tælles ikke i "lukket denne uge" og behandlingstid (datafejl). En genåbnet sag (lukkedato sat, men åben status) tælles som åben. | `lukkedeStatusser` |
| Lukkedato | Sagens eget lukkedato-felt. ⚠ Afventer: om feltet findes. Fallback "sidst ændret" er upræcis og frarådes. | `lukkedatoKilde` |
| Beløb | Kr. ekskl. moms. Afrundes til hele øre ved summering. | — |

## 1. Åbne sager

**Antal sager, der er oprettet senest nu og ikke har en lukket status.**
Øjebliksbillede; følger ikke periodevælgeren.

## 2. Lukket i indeværende uge

**Antal sager lukket fra mandag 00:00 i indeværende ISO-uge til nu.**
Delta: forskellen i antal sammenlignet med forrige uge (efter `sammenligning`).
Følger ikke periodevælgeren.

## 3. Pipeline (mulig omsætning i åbne sager)

**Sum af forventet salær for alle åbne sager.** Pr. sag:

1. Sagens felt *forventet salær*, hvis det er udfyldt (også hvis det er 0 kr.).
2. Ellers fallback: *sandsynlighed × forventet indtægt* for sagstypen.

Kortet viser også antal sager bag tallet, og hvor mange der er estimeret via fallback.

| Sagstype | Sandsynlighed | Forventet indtægt | ⚠ |
|---|---|---|---|
| Inkasso med aktiver | 70 % | 9.000 kr. | Pladsholder |
| Inkasso uden aktiver | 35 % | 2.500 kr. | Pladsholder |
| Detektivarbejde | 90 % | 25.000 kr. | Pladsholder |
| Konkursarbejde | 60 % | 45.000 kr. | Pladsholder |

Konfiguration: `pipelineFallback`. **Ledelsen skal fastsætte de rigtige værdier.**

## 4. Realiseret omsætning

**Sum af salær (honorar) i perioden fra e-conomic, ekskl. moms.**

- **Kun salær tæller.** Hovedstol, renter og andre beløb, der videresendes til klienten, og udlæg tæller ikke med. Salær genkendes på varenummer og/eller varegruppe. ⚠ Afventer: jeres vareliste.
- **Kreditnotaer trækkes fra** på kreditnotaens dato. En periode kan derfor have negativ omsætning.
- **Datogrundlag**, standard *fakturadato* (faktureret salær). Alternativet *betalingsdato* (indbetalt salær) er forberedt i config, men kræver læsning af posteringer i e-conomic og er ikke implementeret endnu. ⚠ Afventer jeres valg.
- **Toggle:** I dag / Denne uge / Denne måned (til dato), med procentvis ændring mod forrige tilsvarende periode. Ændringen vises ikke, hvis forrige periode var 0 kr. eller negativ.

Konfiguration: `omsaetningsgrundlag`, `economic.*`.

## 5. Gennemsnitlig sagsbehandlingstid

**For sager lukket i den valgte periode: antal kalenderdage fra oprettelsesdato til lukkedato.**

- Lukket samme dag som oprettet = **0 dage**. Oprettet kl. 23:50 og lukket kl. 00:10 næste dag = **1 dag**.
- Både **gennemsnit** og **median** vises. Medianen påvirkes ikke af enkelte meget lange sager.
- Sager med lukkedato før oprettelsesdato (datafejl) udelades.
- Ingen sager lukket i perioden: der vises "–", ikke 0.
- Følger periodevælgeren.

## 6. Omsætning fordelt på sagstyper

**Realiseret omsætning (som KPI 4) i den valgte periode, opdelt på:**
Inkasso med aktiver · Inkasso uden aktiver · Detektivarbejde · Konkursarbejde.

- Alle fire typer vises altid, også med 0 kr.
- Salær uden kendt sagstype vises som en separat række, **"Ukendt sagstype"**, i stedet for at blive gættet ind under en type.
- Andel i % = typens beløb / total. Hvis totalen er 0 eller negativ, vises andel som "–".
- Kreditnotaer trækkes fra den sagstype, de tilhører.

Sagstype udledes (⚠ Afventer), i prioriteret rækkefølge:

1. Varegruppe → sagstype i e-conomic (`economic.varegruppeTilSagstype`).
2. Sagsnummer på fakturaen (`economic.sagsreferenceFelt`), slået op i sagssystemet.
3. Ellers "Ukendt sagstype".

## Ekstra: Omsætning pr. uge

Realiseret omsætning pr. ISO-uge for de seneste 12 uger (`ugerITrend`). Den indeværende uge er markeret, fordi den kun er talt til dato.

## Opdatering og forældede data

| Indstilling | Standard | `.env` |
|---|---|---|
| Serveren henter fra kilderne | hvert 3. min. | `REFRESH_SECONDS` |
| Browseren henter fra serveren | hvert minut | `CLIENT_POLL_SECONDS` |
| Advarsel om gamle tal | efter 15 min. | `STALE_AFTER_MINUTES` |
| Periodeskift på storskærm | hvert 30. sek. (0 = fra) | `TV_ROTATION_SECONDS` |

Fejler en kilde, beholdes de sidst kendte data, og der vises en diskret advarsel. De beregnede (aggregerede) tal gemmes desuden på disk, så de overlever en genstart.
