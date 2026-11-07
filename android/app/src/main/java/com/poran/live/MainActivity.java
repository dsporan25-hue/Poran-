package com.poran.live;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.poran.live.streaming.PoranStreamingPlugin;
import com.poran.live.PoranSecureStorePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PoranStreamingPlugin.class);
        registerPlugin(PoranSecureStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
