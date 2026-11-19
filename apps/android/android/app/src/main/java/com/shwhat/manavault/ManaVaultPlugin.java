package com.shwhat.manavault;

import android.Manifest;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;

import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.File;
import java.io.FileOutputStream;

/**
 * The app's native features for the web interface: saved sign-in, text recognition on the phone,
 * the background Inbox check, saving files, and the Back button.
 */
@CapacitorPlugin(
    name = "ManaVault",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class ManaVaultPlugin extends Plugin {
    static final String EXTRA_OFFER = "com.shwhat.manavault.OFFER";
    private TextRecognizer recognizer;
    private String launchOffer;

    @Override
    public void load() {
        launchOffer = getActivity().getIntent().getStringExtra(EXTRA_OFFER);
        getActivity().getIntent().removeExtra(EXTRA_OFFER);
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                notifyListeners("backButton", new JSObject(), true);
            }
        });
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String offer = intent.getStringExtra(EXTRA_OFFER);
        if (offer != null) {
            JSObject data = new JSObject();
            data.put("offer", offer);
            notifyListeners("offer", data, true);
        }
    }

    // ---------- settings ----------

    @PluginMethod
    public void getSettings(PluginCall call) {
        Settings settings = Settings.get(getContext());
        JSObject result = new JSObject();
        result.put("server", settings.server());
        result.put("token", settings.token());
        result.put("user", settings.user());
        result.put("userId", settings.userId());
        result.put("notifications", settings.notifications());
        result.put("wifiOnly", settings.wifiOnly());
        call.resolve(result);
    }

    @PluginMethod
    public void setSettings(PluginCall call) {
        Settings.get(getContext()).update(call.getData());
        call.resolve();
    }

    @PluginMethod
    public void clearSettings(PluginCall call) {
        Settings.get(getContext()).clear();
        InboxWorker.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void appInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("version", BuildConfig.VERSION_NAME);
        result.put("android", Build.VERSION.RELEASE);
        String maker = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String model = Build.MODEL == null ? "Android phone" : Build.MODEL;
        result.put("device", model.toLowerCase().startsWith(maker.toLowerCase()) ? model : (maker + " " + model).trim());
        call.resolve(result);
    }

    // ---------- text recognition ----------

    @PluginMethod
    public void recognize(PluginCall call) {
        String image = call.getString("image");
        if (image == null || image.isEmpty()) {
            call.reject("No picture to read.");
            return;
        }
        Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(image, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException error) {
            bitmap = null;
        }
        if (bitmap == null) {
            call.reject("The picture could not be read.");
            return;
        }
        if (recognizer == null) recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        final int width = bitmap.getWidth();
        final int height = bitmap.getHeight();
        recognizer.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener(text -> {
                JSArray lines = new JSArray();
                for (Text.TextBlock block : text.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        Rect box = line.getBoundingBox();
                        if (box == null) continue;
                        JSObject item = new JSObject();
                        item.put("text", line.getText());
                        item.put("left", box.left);
                        item.put("top", box.top);
                        item.put("right", box.right);
                        item.put("bottom", box.bottom);
                        lines.put(item);
                    }
                }
                JSObject result = new JSObject();
                result.put("lines", lines);
                result.put("width", width);
                result.put("height", height);
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject("Text recognition failed: " + error.getMessage()));
    }

    // ---------- notifications ----------

    @PluginMethod
    public void setNotifications(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        boolean wifiOnly = Boolean.TRUE.equals(call.getBoolean("wifiOnly", false));
        if (enabled && Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsAnswered");
            return;
        }
        applyNotifications(call, enabled, wifiOnly);
    }

    @PermissionCallback
    private void notificationsAnswered(PluginCall call) {
        boolean granted = getPermissionState("notifications") == PermissionState.GRANTED;
        applyNotifications(call, granted, Boolean.TRUE.equals(call.getBoolean("wifiOnly", false)));
    }

    private void applyNotifications(PluginCall call, boolean enabled, boolean wifiOnly) {
        JSObject change = new JSObject();
        change.put("notifications", enabled);
        change.put("wifiOnly", wifiOnly);
        Settings.get(getContext()).update(change);
        if (enabled) InboxWorker.start(getContext(), wifiOnly);
        else InboxWorker.stop(getContext());
        JSObject result = new JSObject();
        result.put("granted", enabled || !Boolean.TRUE.equals(call.getBoolean("enabled", false)));
        call.resolve(result);
    }

    @PluginMethod
    public void takeLaunchOffer(PluginCall call) {
        JSObject result = new JSObject();
        result.put("offer", launchOffer);
        launchOffer = null;
        call.resolve(result);
    }

    // ---------- files and the app window ----------

    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "mana-vault-file");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("data", "");
        try {
            File folder = new File(getContext().getCacheDir(), "exports");
            if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("No room for the file.");
            File file = new File(folder, name.replaceAll("[^A-Za-z0-9._-]", "_"));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, name));
            call.resolve();
        } catch (Exception error) {
            call.reject("The file could not be saved: " + error.getMessage());
        }
    }

    /**
     * Turns the light of a back camera on or off, for phones whose camera in the web view does not offer the light.
     * Resolves with ok false when no back camera has a light or the phone refuses while the camera is in use.
     */
    @PluginMethod
    public void setTorch(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        JSObject result = new JSObject();
        try {
            CameraManager manager = (CameraManager) getContext().getSystemService(android.content.Context.CAMERA_SERVICE);
            String chosen = null;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics info = manager.getCameraCharacteristics(id);
                Boolean flash = info.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer facing = info.get(CameraCharacteristics.LENS_FACING);
                if (Boolean.TRUE.equals(flash) && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    chosen = id;
                    break;
                }
            }
            if (chosen == null) {
                result.put("ok", false);
                result.put("reason", "none");
            } else {
                manager.setTorchMode(chosen, on);
                result.put("ok", true);
            }
        } catch (Exception error) {
            result.put("ok", false);
            result.put("reason", "busy");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void minimize(PluginCall call) {
        getActivity().moveTaskToBack(true);
        call.resolve();
    }
}
