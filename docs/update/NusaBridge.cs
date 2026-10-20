using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Diagnostics;
using System.Management;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace NusaBridge {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SYSTEM_POWER_STATUS {
        public byte ACLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte SystemStatusFlag;
        public int BatteryLifeTime;
        public int BatteryFullLifeTime;
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out int pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
        int GetMute(out bool pbMute);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumeratorComObject { }

    class Program {
        [DllImport("user32.dll")]
        static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        static extern bool IsZoomed(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        static extern IntPtr OpenWindowStation(string name, bool inherit, uint access);

        [DllImport("user32.dll", SetLastError = true)]
        static extern bool SetProcessWindowStation(IntPtr hWinSta);

        [DllImport("user32.dll", SetLastError = true)]
        static extern IntPtr OpenDesktop(string name, uint flags, bool inherit, uint access);

        [DllImport("user32.dll", SetLastError = true)]
        static extern bool SetThreadDesktop(IntPtr hDesktop);

        [DllImport("user32.dll")]
        static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        static extern uint GetClipboardSequenceNumber();

        [DllImport("kernel32.dll")]
        static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS sps);

        [DllImport("psapi.dll")]
        static extern bool EmptyWorkingSet(IntPtr hProcess);

        static T WaitWinRT<T>(IAsyncOperation<T> op, int maxMs) {
            if (op == null) return default(T);
            int waited = 0;
            while (op.Status == AsyncStatus.Started && waited < maxMs) {
                Thread.Sleep(4);
                waited += 4;
            }
            if (op.Status == AsyncStatus.Completed) {
                return op.GetResults();
            }
            return default(T);
        }

        static IAudioEndpointVolume cachedSpeakerObj = null;
        static int audioTick = 0;

        static IAudioEndpointVolume GetSpeakerObject() {
            if (cachedSpeakerObj != null && (++audioTick % 40 != 0)) {
                return cachedSpeakerObj;
            }
            try {
                var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
                IMMDevice dev = null;
                enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                if (dev == null) return null;
                Guid iid = typeof(IAudioEndpointVolume).GUID;
                object o = null;
                dev.Activate(ref iid, 23, IntPtr.Zero, out o);
                cachedSpeakerObj = o as IAudioEndpointVolume;
                return cachedSpeakerObj;
            } catch {
                cachedSpeakerObj = null;
                return null;
            }
        }

        static int GetVolume() {
            var v = GetSpeakerObject();
            if (v == null) return -1;
            float level = 0;
            v.GetMasterVolumeLevelScalar(out level);
            return (int)Math.Round(level * 100);
        }

        static bool GetMute() {
            var v = GetSpeakerObject();
            if (v == null) return false;
            bool mute = false;
            v.GetMute(out mute);
            return mute;
        }

        static void SetVolume(int percent) {
            var v = GetSpeakerObject();
            if (v == null) return;
            float clamped = Math.Max(0f, Math.Min(100f, percent)) / 100f;
            v.SetMasterVolumeLevelScalar(clamped, Guid.Empty);
        }

        static void SetMute(bool mute) {
            var v = GetSpeakerObject();
            if (v == null) return;
            v.SetMute(mute, Guid.Empty);
        }

        static int cachedBrightness = 80;
        static int GetBrightness() {
            try {
                using (var searcher = new ManagementObjectSearcher("root\\WMI", "SELECT CurrentBrightness FROM WmiMonitorBrightness")) {
                    foreach (ManagementObject obj in searcher.Get()) {
                        cachedBrightness = Convert.ToInt32(obj["CurrentBrightness"]);
                        break;
                    }
                }
            } catch {}
            return cachedBrightness;
        }

        static void SetBrightness(int target) {
            try {
                int clamped = Math.Max(5, Math.Min(100, target));
                using (var searcher = new ManagementObjectSearcher("root\\WMI", "SELECT * FROM WmiMonitorBrightnessMethods")) {
                    foreach (ManagementObject obj in searcher.Get()) {
                        obj.InvokeMethod("WmiSetBrightness", new object[] { (uint)1, (byte)clamped });
                        cachedBrightness = clamped;
                        break;
                    }
                }
            } catch {}
        }

        static void SendMediaKey(byte vk) {
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            keybd_event(vk, 0, 2, UIntPtr.Zero);
        }

        // Suppress large bottom-right Windows 10/11 Toast Banner popups when Kora handles notifications
        static bool suppressWindowsToasts = true;
        static void DismissWindowsToastPopups() {
            if (!suppressWindowsToasts) return;
            try {
                IntPtr h1 = FindWindowEx(IntPtr.Zero, IntPtr.Zero, "Windows.UI.Core.CoreWindow", "Nouvelle notification");
                if (h1 != IntPtr.Zero) {
                    ShowWindow(h1, 0);
                    PostMessage(h1, 0x0010, IntPtr.Zero, IntPtr.Zero);
                }
                IntPtr h2 = FindWindowEx(IntPtr.Zero, IntPtr.Zero, "Windows.UI.Core.CoreWindow", "New notification");
                if (h2 != IntPtr.Zero) {
                    ShowWindow(h2, 0);
                    PostMessage(h2, 0x0010, IntPtr.Zero, IntPtr.Zero);
                }
            } catch {}
        }

        static void TrimMemory() {
            try {
                using (Process p = Process.GetCurrentProcess()) {
                    EmptyWorkingSet(p.Handle);
                }
                foreach (var p in Process.GetProcessesByName("electron")) {
                    try { EmptyWorkingSet(p.Handle); } catch {}
                    p.Dispose();
                }
            } catch {}
        }

        static GlobalSystemMediaTransportControlsSessionManager sessionManager = null;
        static GlobalSystemMediaTransportControlsSession activeSession = null;
        static string lastThumbKey = "";
        static string lastThumbB64 = "";

        static void EnsureSessionManager() {
            if (sessionManager != null) return;
            try {
                sessionManager = WaitWinRT(GlobalSystemMediaTransportControlsSessionManager.RequestAsync(), 800);
            } catch {}
        }

        static GlobalSystemMediaTransportControlsSession SelectBestSession() {
            EnsureSessionManager();
            if (sessionManager == null) return null;
            try {
                var sessions = sessionManager.GetSessions();
                if (sessions == null || sessions.Count == 0) {
                    return sessionManager.GetCurrentSession();
                }

                GlobalSystemMediaTransportControlsSession playingMusic = null;
                GlobalSystemMediaTransportControlsSession playingAny = null;
                GlobalSystemMediaTransportControlsSession pausedMusic = null;
                GlobalSystemMediaTransportControlsSession firstValid = null;

                foreach (var s in sessions) {
                    if (firstValid == null) firstValid = s;
                    var pb = s.GetPlaybackInfo();
                    string st = (pb != null) ? pb.PlaybackStatus.ToString() : "Stopped";
                    string src = s.SourceAppUserModelId ?? "";
                    string srcLow = src.ToLowerInvariant();
                    bool isMusicApp = srcLow.Contains("applemusic") || srcLow.Contains("spotify") ||
                                      srcLow.Contains("itunes") || srcLow.Contains("deezer") ||
                                      srcLow.Contains("tidal") || srcLow.Contains("music") ||
                                      srcLow.Contains("vlc") || srcLow.Contains("foobar");

                    if (st == "Playing") {
                        if (isMusicApp && playingMusic == null) playingMusic = s;
                        if (playingAny == null) playingAny = s;
                    } else if (isMusicApp && pausedMusic == null) {
                        pausedMusic = s;
                    }
                }

                if (playingMusic != null) return playingMusic;
                if (playingAny != null) return playingAny;
                if (pausedMusic != null) return pausedMusic;
                var cur = sessionManager.GetCurrentSession();
                return cur ?? firstValid;
            } catch {
                return null;
            }
        }

        static bool lastHasActiveApp = false;
        static bool lastIsMaximized = false;
        static bool lastIsFullscreen = false;
        static StringBuilder sbBuf = new StringBuilder(256);
        static bool desktopAttached = false;

        static void EnsureDesktopAttached() {
            try {
                IntPtr hwinsta = OpenWindowStation("WinSta0", false, 0x0000037F);
                if (hwinsta != IntPtr.Zero) SetProcessWindowStation(hwinsta);
                IntPtr hdesk = OpenDesktop("Default", 0, false, 0x000001FF);
                if (hdesk != IntPtr.Zero) SetThreadDesktop(hdesk);
                desktopAttached = true;
            } catch {}
        }

        static void GetWindowEnv(out bool hasActiveApp, out bool isMaximized, out bool isFullscreen) {
            if (!desktopAttached) {
                EnsureDesktopAttached();
            }

            IntPtr hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) {
                EnsureDesktopAttached();
                hwnd = GetForegroundWindow();
            }

            if (hwnd == IntPtr.Zero) {
                hasActiveApp = lastHasActiveApp;
                isMaximized = lastIsMaximized;
                isFullscreen = lastIsFullscreen;
                return;
            }

            sbBuf.Clear();
            GetWindowText(hwnd, sbBuf, 256);
            string title = sbBuf.ToString();
            if (title.StartsWith("Kora") || title == "Nusa Notch") {
                hasActiveApp = lastHasActiveApp;
                isMaximized = lastIsMaximized;
                isFullscreen = lastIsFullscreen;
                return;
            }

            if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) {
                hasActiveApp = lastHasActiveApp = false;
                isMaximized = lastIsMaximized = false;
                isFullscreen = lastIsFullscreen = false;
                return;
            }

            sbBuf.Clear();
            GetClassName(hwnd, sbBuf, 256);
            string cls = sbBuf.ToString();
            if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd" ||
                cls == "Windows.UI.Core.CoreWindow" || cls == "EdgeUiInputTopWndClass" || cls == "ForegroundStaging" ||
                (cls == "ApplicationFrameWindow" && title.Length == 0)) {
                hasActiveApp = lastHasActiveApp = false;
                isMaximized = lastIsMaximized = false;
                isFullscreen = lastIsFullscreen = false;
                return;
            }

            RECT r;
            GetWindowRect(hwnd, out r);
            int scrW = GetSystemMetrics(0);
            int scrH = GetSystemMetrics(1);
            int winW = r.Right - r.Left;
            int winH = r.Bottom - r.Top;

            if (winW < 120 || winH < 80) {
                hasActiveApp = lastHasActiveApp = false;
                isMaximized = lastIsMaximized = false;
                isFullscreen = lastIsFullscreen = false;
                return;
            }

            bool zoomed = IsZoomed(hwnd);

            // VRAI PLEIN ÉCRAN (F11, YouTube plein écran, VLC, Jeux vidéo)
            bool isTrueFullscreen = (r.Left <= 0 && r.Top <= 0 && winW >= scrW && winH >= scrH);

            // MAXIMISÉ STANDARD (Bouton Agrandir, barre des tâches Windows visible)
            bool isNormalMaximized = zoomed || (r.Top <= 10 && winW >= scrW - 40 && winH >= scrH - 90);

            hasActiveApp = lastHasActiveApp = true;
            isMaximized = lastIsMaximized = isNormalMaximized;
            isFullscreen = lastIsFullscreen = isTrueFullscreen;
        }

        static string EscapeJson(string s) {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder sb = new StringBuilder(s.Length + 8);
            foreach (char c in s) {
                switch (c) {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32) sb.Append(' ');
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }

        static void Main() {
            Console.OutputEncoding = Encoding.UTF8;
            try {
                Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal;
            } catch {}

            var cmdQueue = new ConcurrentQueue<string>();
            Task.Run(() => {
                while (true) {
                    string line = Console.ReadLine();
                    if (line == null) break;
                    cmdQueue.Enqueue(line);
                }
            });

            string lastJsonSent = "";
            string cachedMediaJson = "null";
            bool isPlayingMedia = false;
            int tick = 0;
            int idleCounter = 0;
            int batPct = 100;
            bool charging = false;
            int brightness = GetBrightness();
            bool hasActiveApp = true, isMaximized = false, isFullscreen = false;

            TrimMemory();

            while (true) {
                string cmd;
                bool hadCmd = false;
                while (cmdQueue.TryDequeue(out cmd)) {
                    hadCmd = true;
                    var s = activeSession ?? SelectBestSession();
                    if (cmd == "PLAY_PAUSE") {
                        if (s != null) { try { WaitWinRT(s.TryTogglePlayPauseAsync(), 350); } catch {} }
                        else SendMediaKey(0xB3);
                    } else if (cmd == "NEXT") {
                        if (s != null) { try { WaitWinRT(s.TrySkipNextAsync(), 350); } catch {} }
                        else SendMediaKey(0xB0);
                    } else if (cmd == "PREV") {
                        if (s != null) { try { WaitWinRT(s.TrySkipPreviousAsync(), 350); } catch {} }
                        else SendMediaKey(0xB1);
                    } else if (cmd.StartsWith("SEEK:")) {
                        double sec;
                        if (double.TryParse(cmd.Substring(5), out sec) && s != null) {
                            try { WaitWinRT(s.TryChangePlaybackPositionAsync((long)(sec * 10000000)), 350); } catch {}
                        }
                    } else if (cmd.StartsWith("VOL_SET:")) {
                        int v;
                        if (int.TryParse(cmd.Substring(8), out v)) SetVolume(v);
                    } else if (cmd == "VOL_MUTE_TOGGLE") {
                        SetMute(!GetMute());
                    } else if (cmd.StartsWith("BRT_SET:") || cmd.StartsWith("BRIGHTNESS_SET:")) {
                        int b;
                        string sub = cmd.Contains("BRIGHTNESS_SET:") ? cmd.Substring(15) : cmd.Substring(8);
                        if (int.TryParse(sub, out b)) SetBrightness(b);
                    } else if (cmd == "TOAST_SUPPRESS_ON") {
                        suppressWindowsToasts = true;
                    } else if (cmd == "TOAST_SUPPRESS_OFF") {
                        suppressWindowsToasts = false;
                    } else if (cmd == "TRIM_MEM") {
                        TrimMemory();
                    }
                }

                DismissWindowsToastPopups();

                POINT pt;
                GetCursorPos(out pt);
                int scrW = GetSystemMetrics(0);
                int centerX = scrW / 2;
                bool mouseDown = (GetAsyncKeyState(0x01) & 0x8000) != 0;
                bool inPillZone = (pt.Y >= 0 && pt.Y <= 36 && Math.Abs(pt.X - centerX) <= 93);
                bool atTopEdge = inPillZone;
                bool inNotchZone = (pt.Y >= 0 && pt.Y <= 235 && Math.Abs(pt.X - centerX) <= 265);
                bool dragNearTop = (mouseDown && pt.Y <= 95 && Math.Abs(pt.X - centerX) <= 240);
                uint clipSeq = GetClipboardSequenceNumber();
                int vol = GetVolume();
                bool mute = GetMute();
                bool caps = (GetAsyncKeyState(0x14) & 0x0001) != 0;

                GetWindowEnv(out hasActiveApp, out isMaximized, out isFullscreen);

                if (tick % 16 == 0 || hadCmd) {
                    SYSTEM_POWER_STATUS sps;
                    if (GetSystemPowerStatus(out sps)) {
                        batPct = sps.BatteryLifePercent <= 100 ? sps.BatteryLifePercent : 100;
                        charging = (sps.ACLineStatus == 1);
                    }

                    brightness = GetBrightness();

                    var sess = SelectBestSession();
                    activeSession = sess;
                    if (sess != null) {
                        try {
                            var props = WaitWinRT(sess.TryGetMediaPropertiesAsync(), 350);
                            if (props != null) {
                                var pb = sess.GetPlaybackInfo();
                                var tl = sess.GetTimelineProperties();
                                string title = props.Title ?? "";
                                string artist = props.Artist ?? "";
                                string album = props.AlbumTitle ?? "";
                                string status = (pb != null) ? pb.PlaybackStatus.ToString() : "Stopped";
                                isPlayingMedia = (status == "Playing");

                                int posSec = 0, durSec = 0;
                                if (tl != null) {
                                    posSec = (int)tl.Position.TotalSeconds;
                                    durSec = (int)tl.EndTime.TotalSeconds;
                                    if (isPlayingMedia) {
                                        double elapsed = (DateTimeOffset.UtcNow - tl.LastUpdatedTime).TotalSeconds;
                                        if (elapsed > 0 && elapsed < 3600) {
                                            posSec = Math.Min(durSec, (int)(tl.Position.TotalSeconds + elapsed));
                                        }
                                    }
                                }

                                string thumbKey = title + "|" + artist;
                                if (thumbKey != lastThumbKey && title.Length > 0) {
                                    lastThumbKey = thumbKey;
                                    lastThumbB64 = "";
                                    if (props.Thumbnail != null) {
                                        try {
                                            var winSt = WaitWinRT(props.Thumbnail.OpenReadAsync(), 450);
                                            if (winSt != null && winSt.Size > 0 && winSt.Size < 2000000) {
                                                uint sz = (uint)winSt.Size;
                                                var reader = new DataReader(winSt.GetInputStreamAt(0));
                                                WaitWinRT(reader.LoadAsync(sz), 350);
                                                byte[] bytes = new byte[sz];
                                                reader.ReadBytes(bytes);
                                                lastThumbB64 = "data:image/jpeg;base64," + Convert.ToBase64String(bytes);
                                                reader.Dispose();
                                                winSt.Dispose();
                                            }
                                        } catch {}
                                    }
                                }

                                cachedMediaJson = string.Format(
                                    "{{\"title\":\"{0}\",\"artist\":\"{1}\",\"album\":\"{2}\",\"status\":\"{3}\",\"position\":{4},\"duration\":{5},\"thumbnail\":\"{6}\"}}",
                                    EscapeJson(title), EscapeJson(artist), EscapeJson(album),
                                    EscapeJson(status), posSec, durSec, lastThumbB64
                                );
                            } else {
                                cachedMediaJson = "null";
                                isPlayingMedia = false;
                            }
                        } catch {
                            cachedMediaJson = "null";
                            isPlayingMedia = false;
                        }
                    } else {
                        cachedMediaJson = "null";
                        isPlayingMedia = false;
                    }
                }
                tick++;

                string json = string.Format(
                    "{{\"battery\":{{\"percent\":{0},\"charging\":{1}}},\"audio\":{{\"volume\":{2},\"muted\":{3},\"device\":\"Audio Windows\"}},\"brightness\":{4},\"window\":{{\"hasActiveApp\":{5},\"isMaximized\":{6},\"isFullscreen\":{7}}},\"capsLock\":{8},\"mouseDown\":{9},\"atTopEdge\":{10},\"inNotchZone\":{11},\"dragNearTop\":{12},\"clipSeq\":{13},\"media\":{14}}}",
                    batPct, charging ? "true" : "false",
                    vol, mute ? "true" : "false",
                    brightness,
                    hasActiveApp ? "true" : "false",
                    isMaximized ? "true" : "false",
                    isFullscreen ? "true" : "false",
                    caps ? "true" : "false",
                    mouseDown ? "true" : "false",
                    atTopEdge ? "true" : "false",
                    inNotchZone ? "true" : "false",
                    dragNearTop ? "true" : "false",
                    clipSeq,
                    cachedMediaJson
                );

                if (json != lastJsonSent || hadCmd) {
                    lastJsonSent = json;
                    Console.WriteLine("NUSA_STATE:" + json);
                    Console.Out.Flush();
                    idleCounter = 0;
                } else {
                    idleCounter++;
                    if (idleCounter == 60) {
                        TrimMemory();
                    }
                }

                Thread.Sleep(40);
            }
        }
    }
}
