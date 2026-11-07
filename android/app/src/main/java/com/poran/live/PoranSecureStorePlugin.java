package com.poran.live;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "PoranSecureStore")
public class PoranSecureStorePlugin extends Plugin {
    private static final String ALIAS = "PoranLiveFacebookConfig";
    private static final String PREFS = "poran_secure_config";

    private SecretKey getKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) {
            return (SecretKey) ks.getKey(ALIAS, null);
        }
        KeyGenerator kg = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
        );
        kg.init(new KeyGenParameterSpec.Builder(
            ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build()
        );
        return kg.generateKey();
    }

    @PluginMethod
    public void saveConfig(PluginCall call) {
        String server = call.getString("serverUrl");
        String key = call.getString("streamKey");
        if (server == null || key == null ||
            server.trim().isEmpty() || key.trim().isEmpty()) {
            call.reject("Server URL and Stream Key are required.");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getKey());
            String plain = server.trim() + "\n" + key.trim();
            byte[] encrypted = cipher.doFinal(
                plain.getBytes(StandardCharsets.UTF_8)
            );
            SharedPreferences prefs = getContext().getSharedPreferences(
                PREFS, Context.MODE_PRIVATE
            );
            boolean saved = prefs.edit()
                .putString("data", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .commit();
            if (!saved) {
                call.reject("Could not save secure settings.");
                return;
            }
            call.resolve(new JSObject().put("saved", true));
        } catch (Exception e) {
            call.reject("Secure save failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getConfig(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(
                PREFS, Context.MODE_PRIVATE
            );
            String data = prefs.getString("data", null);
            String ivText = prefs.getString("iv", null);
            JSObject result = new JSObject();
            if (data == null || ivText == null) {
                result.put("configured", false);
                call.resolve(result);
                return;
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                Cipher.DECRYPT_MODE,
                getKey(),
                new GCMParameterSpec(
                    128, Base64.decode(ivText, Base64.NO_WRAP)
                )
            );
            String plain = new String(
                cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)),
                StandardCharsets.UTF_8
            );
            int split = plain.indexOf('\n');
            if (split < 0) {
                call.reject("Invalid saved configuration.");
                return;
            }
            result.put("configured", true);
            result.put("serverUrl", plain.substring(0, split));
            result.put("streamKey", plain.substring(split + 1));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Secure read failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearConfig(PluginCall call) {
        boolean cleared = getContext().getSharedPreferences(
            PREFS, Context.MODE_PRIVATE
        ).edit().clear().commit();
        call.resolve(new JSObject().put("cleared", cleared));
    }
}
