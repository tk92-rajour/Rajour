# Åbne punkter: sagssystem og e-conomic

Dashboardet kører i dag på **demodata**. Før det kan kobles til de rigtige kilder, skal nedenstående afklares.
Sagssystemets kode og databaseskema har endnu ikke været tilgængelige, så listen bygger på, hvad KPI'erne kræver. Den skal opdateres, når skemaet er gennemgået.

## Det, sagssystemet skal kunne levere

Til ét read-only view (forslag: `rapport_sager`) med kun disse kolonner:

| Felt | Bruges til | Kendt status | Hvis det mangler |
|---|---|---|---|
| Internt id | Undgå dobbelttælling (vises aldrig) | ? | — |
| **Sagstype** (de fire typer) | KPI 3, 6 | ? | Skal tilføjes eller udledes. Er "med/uden aktiver" et felt eller en type? |
| **Status** | KPI 1, 2, 3, 5 | ? | Liste over mulige værdier, og hvilke der betyder lukket |
| **Oprettelsesdato** | KPI 5 | ? | — |
| **Lukkedato** | KPI 2, 5 | ? | **Bør tilføjes**, sat automatisk når status skifter til lukket. "Sidst ændret" giver forkerte tal. |
| **Forventet salær** | KPI 3 | ? | Kan tilføjes. Indtil da bruges fallback pr. sagstype (pladsholdere). |
| Sagsnummer (kun til kobling med fakturaer) | KPI 6 | ? | Kun nødvendig, hvis sagstype ikke kan udledes i e-conomic |

**Forslag (kræver jeres OK, intet ændres uden):**
1. Opret viewet `rapport_sager` med ovenstående kolonner og ingen persondata.
2. Opret en databasebruger med kun `SELECT` på viewet.
3. Hvis lukkedato mangler: tilføj et felt `lukket_dato`, der sættes, når en sag lukkes.

## Det, e-conomic skal afklare

| # | Spørgsmål | Foreløbig antagelse |
|---|---|---|
| A | Hvordan kobles en faktura til en sag? | Sagsnummer i *Reference* (`references.other`) |
| B | Hvordan adskilles salær fra hovedstol og udlæg? | Eget varenummer/varegruppe for salær. **Vi skal bruge jeres vareliste.** |
| C | Hvordan findes sagstypen? | Varegruppe pr. sagstype, ellers via sagen i sagssystemet |
| D | Fakturadato eller betalingsdato? | Fakturadato (standard). Betalingsdato kræver læsning af posteringer. |
| — | API-adgang | En app med læseadgang og et *Agreement Grant Token* fra jeres e-conomic-aftale |

Indtil B er afklaret, **nægter e-conomic-kilden at starte**, frem for at tælle forkert.

## Øvrige spørgsmål

| # | Spørgsmål |
|---|---|
| E | Hvilke statusser betyder "lukket"? (fx Lukket, Afsluttet, Annulleret) Skal annullerede sager tælle med i "lukket denne uge" og i behandlingstid? |
| F | Fallback for pipeline: sandsynlighed og forventet indtægt pr. sagstype |
| H | Kan en sag skifte sagstype? |
| I | Genåbnes sager, og hvordan registreres det? |
| J | Hvilken maskine skal dashboardet køre på (Linux/Windows, Docker eller ej)? |
