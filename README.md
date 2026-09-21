# homebridge-eaton-xstorage

Plugin Homebridge (Dynamic Platform) per integrare l'inverter fotovoltaico e sistema di accumulo **Eaton xStorage Home** nell'ecosistema **Apple HomeKit** e nell'app **Eve**.

<p align="center">
  <img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-wordmark-color-vertical.png" width="150">
</p>

## ✨ Caratteristiche

- 🔋 **Icona Batteria Nativa Apple Home (`BatteryService`)**:
  - Percentuale di carica reale (`State of Charge` da 0% a 100%)
  - Stato di ricarica in corso (in carica col fulmine / non in carica)
  - Notifica automatica batteria scarica sotto la soglia di riserva configurabile.
- 🔌 **Prese Intelligenti Virtuali (`Service.Outlet`)**:
  - **Produzione Solare**: attiva e "In Uso" quando i pannelli solari generano energia (> 20 W), spenta di notte.
  - **Consumi Casa**: attiva quando l'abitazione assorbe corrente.
  - **Immissione in Rete**: attiva e "In Uso" quando c'è surplus solare immesso in rete.
  - **Carica Batteria**: attiva quando la batteria è in fase di ricarica attiva.
- ⚡ **Compatibilità Avanzata con l'App Eve**:
  - Ciascuna presa espone la caratteristica ufficiale Eve Energy `CurrentConsumption` (Watt reali `W` e grafici a curva giornalieri!).
- 🔔 **Sensore di Contatto per Automazioni**:
  - `Grid Exporting`: Aperto quando immetti energia solare in rete. Ottimo per avviare carichi pesanti (es. lavatrice, climatizzatore).
- 💡 **Sensori Lux (Opzionale)**:
  - Disponibili disattivati di default se si preferisce vedere anche il valore numerico (1 Lux = 1 W).
- 🔄 **Connessione Locale e Veloce**:
  - Comunica direttamente con l'inverter sulla rete locale via HTTPS (porta 443).
  - Refresh periodico configurabile (default: ogni 10 secondi).
  - Gestione automatica del token di autenticazione e auto-reconnect.

---

## 📦 Installazione

### Tramite Homebridge Config UI X (Consigliato)
1. Apri la schermata web di Homebridge (Config UI X).
2. Vai nella scheda **Plugin**.
3. Cerca `homebridge-eaton-xstorage` (o installa dalla cartella locale).
4. Clicca su **Installa**.

### Tramite Terminale
```bash
npm install -g homebridge-eaton-xstorage
```

Se stai sviluppando o testando il plugin localmente da questa cartella:
```bash
# Entra nella directory del plugin
cd DomoDev

# Crea il collegamento globale per Homebridge
npm link
```

---

## ⚙️ Configurazione

### Configurazione Guidata (Homebridge Config UI X)
Puoi configurare il plugin direttamente dall'interfaccia grafica con:
- **Indirizzo IP**: `192.168.1.73` (o l'IP del tuo inverter).
- **Nome Utente**: Il nome utente per accedere alla web interface dell'inverter.
- **Password**: La password per accedere alla web interface dell'inverter.
- **Intervallo di aggiornamento**: Frequenza di polling (es. 10 secondi).
- **Mostra potenze come Lux in Apple Home**: Abilita la lettura istantanea in Lux (1 Lux = 1 W).
- **Caratteristiche Eve**: Abilita la lettura dei Watt nell'applicazione Eve.

### Esempio `config.json`
Aggiungi la piattaforma nella sezione `platforms` del file `config.json` di Homebridge:

```json
{
  "platforms": [
    {
      "platform": "EatonXStorage",
      "name": "Eaton xStorage",
      "ip": "192.168.1.73",
      "username": "tuo_username",
      "password": "tua_password",
      "pollInterval": 10,
      "exposeLuxSensors": true,
      "exposeEveSensors": true,
      "lowBatteryThreshold": 15
    }
  ]
}
```

---

## 📱 Come appare in Apple Home ed Eve

### In Apple Home (Casa):
1. **Accessorio Batteria**:
   - Icona della batteria con percentuale, icona fulmine durante la carica solare e stato di salute.
2. **Sensori di Luce (1 Lux = 1 Watt)**:
   - *Produzione Solare*: es. `3.420 lux` = 3.420 W solari prodotti dai pannelli.
   - *Consumi Casa*: es. `850 lux` = 850 W assorbiti dall'abitazione.
   - *Rete Elettrica*: es. `120 lux` = 120 W scambiati con la rete.
   - *Flusso Batteria*: es. `2.500 lux` = 2.500 W in carica o scarica.
3. **Sensore di Contatto**:
   - *Grid Exporting*: Aperto quando stai immettendo energia solare in rete.

### Nell'App Eve:
- Se utilizzi l'app gratuita **Eve per HomeKit**, ciascun sensore espone la caratteristica nativa di potenza (`W`), permettendoti di visualizzare i watt effettivi e lo storico di produzione/consumo.

---

## 🛠️ Risoluzione Problemi

- **Certificato SSL**: L'inverter utilizza un certificato HTTPS locale autofirmato. Il plugin gestisce automaticamente la connessione protetta senza blocchi.
- **Credenziali Errate**: Se modifichi la password dell'inverter, aggiornala nella schermata delle impostazioni del plugin e riavvia Homebridge.
- **Log Dettagliati**: Per vedere i dati grezzi ricevuti dall'inverter in tempo reale, avvia Homebridge in modalità debug (`-D`) o controlla i log con prefisso `[EatonAccessory] Telemetry updated`.

---

## 📄 Licenza
Apache-2.0
