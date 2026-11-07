package com.poran.live.streaming;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.projection.MediaProjection;
import android.os.Build;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import com.pedro.common.ConnectChecker;
import com.pedro.common.StreamingStatsReport;
import com.pedro.library.rtmp.RtmpDisplay;

public class ScreenCaptureService extends Service implements ConnectChecker {

    public static final String ACTION_START = "PORAN_SCREEN_START";
    public static final String ACTION_STOP = "PORAN_SCREEN_STOP";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_DATA = "projectionData";
    public static final String EXTRA_URL = "streamUrl";

    private static final String CHANNEL_ID = "poran_live_channel";
    private static final int NOTIFICATION_ID = 7001;

    private RtmpDisplay rtmpDisplay;
    private String lastConnectionError = null;
    private BroadcastReceiver screenOffReceiver;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        registerScreenOffReceiver();
    }

    private void registerScreenOffReceiver() {
        if (screenOffReceiver == null) {
            screenOffReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent != null && Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                        android.util.Log.i("PORAN_LIVE", "Display turned off. Stopping live broadcast safely.");
                        sendStatus("SCREEN_OFF", "Display turned off; live stream stopped safely");
                        stopStreaming();
                        stopSelf();
                    }
                }
            };
            IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
            registerReceiver(screenOffReceiver, filter);
        }
    }

    private void unregisterScreenOffReceiver() {
        if (screenOffReceiver != null) {
            try {
                unregisterReceiver(screenOffReceiver);
            } catch (Exception ignored) {}
            screenOffReceiver = null;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_STOP.equals(intent.getAction())) {
            stopStreaming();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!ACTION_START.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startLiveNotification();
        sendStatus("SERVICE_STARTED", "Android screen service started");

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent projectionData;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            projectionData = intent.getParcelableExtra(EXTRA_DATA, Intent.class);
        } else {
            projectionData = intent.getParcelableExtra(EXTRA_DATA);
        }
        String streamUrl = intent.getStringExtra(EXTRA_URL);

        if (projectionData == null || streamUrl == null || streamUrl.isEmpty()) {
            sendStatus("FAILED", "Screen capture data or stream URL is missing");
            android.util.Log.e("PORAN_LIVE", "Screen capture data or stream URL is missing");
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            startStreaming(resultCode, projectionData, streamUrl);
        } catch (Exception e) {
            android.util.Log.e("PORAN_LIVE", "STREAM START ERROR", e);
            sendStatus("FAILED", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            stopStreaming();
            stopSelf();
        }

        return START_NOT_STICKY;
    }

    private void startStreaming(int resultCode, Intent data, String url) {
        DisplayMetrics metrics = new DisplayMetrics();
        WindowManager manager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (manager != null) {
            manager.getDefaultDisplay().getRealMetrics(metrics);
        }

        int width = metrics.widthPixels > 0 ? metrics.widthPixels : 720;
        int height = metrics.heightPixels > 0 ? metrics.heightPixels : 1280;
        int dpi = metrics.densityDpi > 0 ? metrics.densityDpi : 320;

        // Scale resolution to standard HD (max 1280 on longer side) for rock-solid stability
        // and full compatibility with Facebook Live RTMP limits
        int maxDim = Math.max(width, height);
        if (maxDim > 1280) {
            float scale = 1280.0f / (float) maxDim;
            width = Math.round((width * scale) / 2.0f) * 2;
            height = Math.round((height * scale) / 2.0f) * 2;
        }
        if (width % 2 != 0) width--;
        if (height % 2 != 0) height--;

        rtmpDisplay = new RtmpDisplay(this, false, this);

        rtmpDisplay.setMediaProjectionCallback(
            new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    stopStreaming();
                    stopSelf();
                }
            }
        );

        rtmpDisplay.setIntentResult(resultCode, data);

        boolean prepared = rtmpDisplay.prepareVideo(
            width, height, 30, 2500000, 0, dpi
        );

        if (!prepared) {
            // Fallback to standard 720x1280 portrait or 1280x720 landscape
            int fallbackW = width >= height ? 1280 : 720;
            int fallbackH = width >= height ? 720 : 1280;
            prepared = rtmpDisplay.prepareVideo(
                fallbackW, fallbackH, 30, 2000000, 0, dpi
            );
        }

        if (!prepared) {
            throw new RuntimeException("Video encoder preparation failed");
        }
        sendStatus("VIDEO_PREPARED", "Screen video encoder is ready (" + width + "x" + height + ")");

        try {
            rtmpDisplay.prepareAudio();
        } catch (Exception audioError) {
            android.util.Log.e("PORAN_LIVE", "Microphone unavailable; continuing without audio", audioError);
        }

        sendStatus("STREAM_START_REQUESTED", "Connecting to Facebook RTMP");
        rtmpDisplay.startStream(url);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "PORAN LIVE Screen Broadcast",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows active screen broadcast and controls");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startLiveNotification() {
        Intent stopIntent = new Intent(this, ScreenCaptureService.class);
        stopIntent.setAction(ACTION_STOP);
        int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 101, stopIntent, pendingFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        Notification notification = builder
            .setContentTitle("PORAN LIVE")
            .setContentText("Screen broadcast is running live")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Live", stopPendingIntent)
            .build();

        if (Build.VERSION.SDK_INT >= 34) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION | ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                );
            } catch (SecurityException se) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                );
            }
        } else if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void stopStreaming() {
        if (rtmpDisplay != null) {
            try {
                rtmpDisplay.stopStream();
            } catch (Exception ignored) {
            }
            rtmpDisplay = null;
        }
    }

    private void sendStatus(String status, String reason) {
        Intent intent = new Intent("com.poran.live.STREAM_STATUS");
        intent.setPackage(getPackageName());
        intent.putExtra("status", status);
        if (reason != null) intent.putExtra("reason", reason);
        sendBroadcast(intent);
    }

    @Override
    public void onConnectionStarted(String url) {
        sendStatus("CONNECTING", null);
        android.util.Log.d("PORAN_LIVE", "Connecting");
    }

    @Override
    public void onConnectionSuccess() {
        sendStatus("CONNECTED", null);
        android.util.Log.d("PORAN_LIVE", "Connected");
    }

    @Override
    public void onConnectionFailed(String reason) {
        lastConnectionError = reason;
        sendStatus("FAILED", reason);
        android.util.Log.e("PORAN_LIVE", reason);
        stopStreaming();
        stopSelf();
    }

    @Override
    public void onDisconnect() {
        sendStatus("DISCONNECTED", lastConnectionError == null ? "RTMP connection closed" : lastConnectionError);
        android.util.Log.d("PORAN_LIVE", "Disconnected");
        stopStreaming();
        stopSelf();
    }

    @Override
    public void onAuthError() {
        sendStatus("AUTH_FAILED", "Facebook authentication failed: please check your Stream Key");
        android.util.Log.e("PORAN_LIVE", "Authentication failed");
        stopStreaming();
        stopSelf();
    }

    @Override
    public void onAuthSuccess() {
        android.util.Log.d("PORAN_LIVE", "Authentication successful");
    }

    @Override
    public void onNewBitrate(long bitrate) {
        android.util.Log.d("PORAN_LIVE", "Bitrate: " + bitrate);
        Intent intent = new Intent("com.poran.live.STREAM_STATUS");
        intent.setPackage(getPackageName());
        intent.putExtra("status", "BITRATE_UPDATE");
        intent.putExtra("bitrate", bitrate);
        sendBroadcast(intent);
    }

    @Override
    public void onStreamingStats(StreamingStatsReport report) {
        Intent intent = new Intent("com.poran.live.STREAM_STATUS");
        intent.setPackage(getPackageName());
        intent.putExtra("status", "STATS_UPDATE");
        intent.putExtra("bitrate", (long) report.getBytesPerSecond() * 8L);
        intent.putExtra("fps", (int) report.getFps());
        sendBroadcast(intent);
    }

    @Override
    public void onDestroy() {
        unregisterScreenOffReceiver();
        stopStreaming();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

