# Romskanner

Liten iPhone-app som måler opp rom med LiDAR (Apples RoomPlan) og sender
målene til Malerguiden. Krever iPhone eller iPad **Pro** med LiDAR
(iPhone 12 Pro eller nyere) og iOS 17.

Appen bygges av GitHub (`.github/workflows/romskanner.yml`) hver gang noe
i `ios/` endres. Den installeres på telefonen med Sideloadly og en gratis
Apple-ID. Med gratis konto må den installeres på nytt hver 7. dag. Rommene
du har skannet, blir liggende.

## Første gang (ca. 20 minutter)

1. **På PC-en:** installer *Apple Devices* (eller iTunes) fra Microsoft Store,
   og Sideloadly fra sideloadly.io.
2. **Last ned appen:** GitHub → Malerguiden → *Actions* → *Bygg Romskanner (iOS)*
   → øverste grønne kjøring → *Artifacts* → **Romskanner-ipa**. Pakk ut zip-fila,
   så har du `Romskanner.ipa`.
3. **Koble iPhonen til PC-en med kabel**, lås den opp og trykk *Stol på*.
4. **Sideloadly:** dra `Romskanner.ipa` inn i vinduet, skriv inn Apple-ID-en din
   og trykk *Start*. Svar på innloggingen og koden fra Apple i Sideloadly.
5. **På iPhonen:**
   - *Innstillinger → Personvern og sikkerhet → Utviklermodus* → slå på og start
     telefonen på nytt (dukker opp etter første installasjon).
   - *Innstillinger → Generelt → VPN og enhetsadministrasjon* → trykk på
     Apple-ID-en din → *Stol på*.

## Hver 7. dag

Koble til telefonen og gjør punkt 4 på nytt med samme fil. Appen og rommene
blir liggende.

## Bruk

1. Trykk **Skann rom**, stå i døråpningen og gå rolig langs veggene. Pek mot
   hjørner og tak. Trykk **Ferdig med rommet**, se på 3D-modellen, og trykk
   **Bruk skanningen**. Gi rommet et navn.
2. Skann resten av rommene på samme måte.
3. Trykk **Kopier til Malerguiden**.
4. I Malerguiden: åpne jobben → **Mål** → **Skanning** → **Lim inn**.

Rommene får gulv, omkrets, takhøyde, veggareal (med vinduer og dører trukket
fra) og antall vinduer og dører. Pris og timer regnes ut under **Pris**.

## Utvikling

Prosjektfila lages av XcodeGen fra `project.yml`, så den ligger ikke i git.
På en Mac: `brew install xcodegen && cd ios && xcodegen generate && open Romskanner.xcodeproj`.
