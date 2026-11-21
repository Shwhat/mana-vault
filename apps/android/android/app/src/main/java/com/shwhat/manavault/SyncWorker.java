package com.shwhat.manavault;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Sends the changes made on the phone as soon as the phone is online again, even when the app is closed (0.17.0).
 * The server applies each change once, so the app sending the same changes again later does no harm.
 */
public class SyncWorker extends Worker {
    private static final String WORK = "mana-vault-sync";
    private static final int BATCH = 100;

    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    /** Runs the worker once the phone has a connection; a newer list of changes replaces a waiting run. */
    static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(SyncWorker.class)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, request);
    }

    static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        Settings settings = Settings.get(context);
        if (settings.server().isEmpty() || settings.token().isEmpty()) return Result.success();
        try {
            JSONArray pending = new JSONArray(settings.pendingSync());
            for (int start = 0; start < pending.length(); start += BATCH) {
                JSONArray batch = new JSONArray();
                for (int index = start; index < Math.min(pending.length(), start + BATCH); index++) batch.put(pending.get(index));
                JSONObject body = new JSONObject();
                body.put("changes", batch);
                int status = post(settings, body.toString());
                if (status == 401) return Result.success();
                if (status != 200) return Result.retry();
            }
            // the app clears its own list the next time it syncs; the server answers each change from what it applied
            settings.setPendingSync("[]");
            return Result.success();
        } catch (Exception error) {
            return Result.retry();
        }
    }

    private static int post(Settings settings, String body) throws java.io.IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(settings.server() + "/api/sync").openConnection();
        try {
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("X-Mana-Vault", "1");
            connection.setRequestProperty("Authorization", "Bearer " + settings.token());
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
            return connection.getResponseCode();
        } finally {
            connection.disconnect();
        }
    }
}
