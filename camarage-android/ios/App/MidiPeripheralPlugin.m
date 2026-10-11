#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor 6 necesita LAS DOS COSAS para registrar un plugin local:
//  1) la clase Swift conforma CAPBridgedPlugin (identifier/jsName/pluginMethods), y
//  2) este macro CAP_PLUGIN, que es el que REGISTRA el plugin con el bridge.
// El nombre JS ("MidiPeripheral") debe coincidir con index.html:
//   window.Capacitor.Plugins.MidiPeripheral
CAP_PLUGIN(MidiPeripheralPlugin, "MidiPeripheral",
    CAP_PLUGIN_METHOD(isSupported, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(send, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startInstrument, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(showWidiPicker, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(sendToMac, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setKeepAwake, CAPPluginReturnPromise);
)

// Sync entre integrantes por red local (clase en MidiPeripheralPlugin.swift)
CAP_PLUGIN(LocalSyncPlugin, "LocalSync",
    CAP_PLUGIN_METHOD(startServer, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startClient, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(send, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(info, CAPPluginReturnPromise);
)
