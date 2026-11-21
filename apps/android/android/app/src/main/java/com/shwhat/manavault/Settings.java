package com.shwhat.manavault;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;

/** The server address, device sign-in and notification choices, kept in encrypted app storage. */
final class Settings {
    private static Settings instance;
    private final SharedPreferences store;

    private Settings(Context context) {
        SharedPreferences opened;
        try {
            MasterKey key = new MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
            opened = EncryptedSharedPreferences.create(context, "mana_vault_settings", key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        } catch (Exception error) {
            // a phone whose key store fails keeps the settings in private app storage instead
            opened = context.getSharedPreferences("mana_vault_settings_plain", Context.MODE_PRIVATE);
        }
        store = opened;
    }

    static synchronized Settings get(Context context) {
        if (instance == null) instance = new Settings(context.getApplicationContext());
        return instance;
    }

    String server() { return store.getString("server", ""); }
    String token() { return store.getString("token", ""); }
    String user() { return store.getString("user", ""); }
    int userId() { return store.getInt("userId", 0); }
    boolean notifications() { return store.getBoolean("notifications", false); }
    boolean wifiOnly() { return store.getBoolean("wifiOnly", false); }
    String lastOffer() { return store.getString("lastOffer", ""); }

    void setLastOffer(String value) {
        store.edit().putString("lastOffer", value).apply();
    }

    /** Changes made on the phone that wait for the server, as the JSON list the app sends to /api/sync (0.17.0). */
    String pendingSync() { return store.getString("pendingSync", "[]"); }

    void setPendingSync(String value) {
        store.edit().putString("pendingSync", value == null || value.isEmpty() ? "[]" : value).apply();
    }

    void update(JSObject change) {
        SharedPreferences.Editor editor = store.edit();
        for (String key : new String[] { "server", "token", "user" }) {
            if (change.has(key)) editor.putString(key, change.getString(key, ""));
        }
        if (change.has("userId")) editor.putInt("userId", change.getInteger("userId", 0));
        for (String key : new String[] { "notifications", "wifiOnly" }) {
            if (change.has(key)) editor.putBoolean(key, Boolean.TRUE.equals(change.getBoolean(key, false)));
        }
        editor.apply();
    }

    void clear() {
        store.edit().clear().apply();
    }
}
