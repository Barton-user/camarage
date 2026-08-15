package com.camarage.live;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar el plugin nativo de periférico BLE MIDI antes de inicializar el bridge.
        registerPlugin(MidiPeripheralPlugin.class);
        super.onCreate(savedInstanceState);
        // Mantener la pantalla SIEMPRE encendida mientras la app esté en primer plano
        // (no depende de que haya conexión MIDI). Se libera sola al minimizar la app.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
