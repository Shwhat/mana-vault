package com.shwhat.manavault;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ManaVaultPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
