package com.shwhat.manavault;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/** Checks the server for new Inbox offers about every 15 minutes and shows a notification for each new one. */
public class InboxWorker extends Worker {
    private static final String WORK = "mana-vault-inbox";
    private static final String CHANNEL = "inbox";

    public InboxWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    static void start(Context context, boolean wifiOnly) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(wifiOnly ? NetworkType.UNMETERED : NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(InboxWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, request);
    }

    static void stop(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        Settings settings = Settings.get(context);
        if (!settings.notifications() || settings.server().isEmpty() || settings.token().isEmpty()) return Result.success();
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(settings.server() + "/api/sync/state").openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setRequestProperty("Authorization", "Bearer " + settings.token());
            int status = connection.getResponseCode();
            if (status == 401) {
                // the phone was signed out on the server: stop checking until it signs in again
                stop(context);
                return Result.success();
            }
            if (status != 200) return Result.retry();
            JSONObject state = new JSONObject(read(connection.getInputStream()));
            JSONArray offers = state.optJSONArray("offers");
            if (offers == null || offers.length() == 0) return Result.success();
            String seen = settings.lastOffer();
            String newestSeen = seen;
            // offers come newest first; notify about those newer than the last one shown
            for (int index = offers.length() - 1; index >= 0; index--) {
                JSONObject offer = offers.getJSONObject(index);
                String created = offer.optString("createdAt", "");
                if (created.compareTo(seen) <= 0) continue;
                show(context, offer);
                if (created.compareTo(newestSeen) > 0) newestSeen = created;
            }
            if (!newestSeen.equals(seen)) settings.setLastOffer(newestSeen);
            return Result.success();
        } catch (Exception error) {
            return Result.retry();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String read(InputStream input) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for (int count; (count = input.read(buffer)) > 0;) out.write(buffer, 0, count);
        return out.toString(StandardCharsets.UTF_8.name());
    }

    private static void show(Context context, JSONObject offer) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null && manager.getNotificationChannel(CHANNEL) == null) {
                manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Inbox offers", NotificationManager.IMPORTANCE_DEFAULT));
            }
        }
        String id = offer.optString("id", "");
        String mode = offer.optString("mode", "copy");
        String how = "share".equals(mode) ? "Share" : "transfer".equals(mode) ? "Transfer" : "Copy";
        String kind = "deck".equals(offer.optString("kind")) ? "deck" : "collection";
        Intent open = new Intent(context, MainActivity.class);
        open.putExtra(ManaVaultPlugin.EXTRA_OFFER, id);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(offer.optString("user", "Someone") + " sent you a " + kind)
            .setContentText(offer.optString("itemName", "") + " (" + how + ")")
            .setContentIntent(tap)
            .setAutoCancel(true);
        NotificationManagerCompat.from(context).notify(id.hashCode(), builder.build());
    }
}
