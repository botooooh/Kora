using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: AssemblyTitle("Kora — Living Notch for Windows")]
[assembly: AssemblyDescription("Installeur & Lanceur Automatique Kora (par Mr Paul)")]
[assembly: AssemblyProduct("Kora")]
[assembly: AssemblyCompany("Mr Paul")]
[assembly: AssemblyVersion("2.0.0.0")]

namespace KoraLauncher
{
    static class Program
    {
        private const string GITHUB_RAW = "https://raw.githubusercontent.com/botooooh/Kora/main";
        private const string ELECTRON_ZIP_URL = "https://github.com/electron/electron/releases/download/v35.0.0/electron-v35.0.0-win32-x64.zip";

        private static readonly string[] APP_FILES = new string[]
        {
            "package.json",
            "main.js",
            "preload.js",
            "index.html",
            "styles.css",
            "renderer.js",
            "nusa-bridge.exe",
            "kora-logo.png",
            "kora.ico"
        };

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            try
            {
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string localAppDataKora = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Kora");

                string[] candidateDirs = new string[]
                {
                    exeDir,
                    Path.GetFullPath(Path.Combine(exeDir, "..")),
                    Path.GetFullPath(Path.Combine(exeDir, "..", "..")),
                    Path.Combine(desktop, "Progammation", "Kora"),
                    Path.Combine(desktop, "Programmation", "Kora"),
                    localAppDataKora
                };

                foreach (string dir in candidateDirs)
                {
                    if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) continue;
                    string candidateElectron = Path.Combine(dir, "node_modules", "electron", "dist", "electron.exe");
                    string candidateMain = Path.Combine(dir, "main.js");
                    if (File.Exists(candidateElectron) && File.Exists(candidateMain))
                    {
                        LaunchKora(candidateElectron, dir);
                        return;
                    }
                }

                // First-time installation on a new user's PC (downloaded from Vercel / GitHub)
                RunFirstTimeWebInstall(localAppDataKora);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Erreur lors du lancement ou de l'installation de Kora : " + ex.Message,
                    "Kora — par Mr Paul",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static void LaunchKora(string electronExe, string appDir)
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = electronExe,
                Arguments = ".",
                WorkingDirectory = appDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            Process.Start(psi);
        }

        private static void RunFirstTimeWebInstall(string targetDir)
        {
            Form form = new Form
            {
                Text = "Installation de Kora — par Mr Paul",
                Size = new Size(420, 175),
                StartPosition = FormStartPosition.CenterScreen,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false,
                BackColor = Color.FromArgb(6, 10, 22),
                ForeColor = Color.White
            };

            Label titleLbl = new Label
            {
                Text = "Installation automatique de Kora...",
                Font = new Font("Segoe UI", 11f, FontStyle.Bold),
                AutoSize = false,
                Location = new Point(22, 22),
                Size = new Size(370, 26),
                ForeColor = Color.FromArgb(25, 184, 255)
            };

            Label subLbl = new Label
            {
                Text = "Téléchargement de la dernière version depuis GitHub...",
                Font = new Font("Segoe UI", 9f, FontStyle.Regular),
                AutoSize = false,
                Location = new Point(22, 52),
                Size = new Size(370, 22),
                ForeColor = Color.FromArgb(180, 190, 210)
            };

            ProgressBar bar = new ProgressBar
            {
                Location = new Point(22, 86),
                Size = new Size(360, 22),
                Minimum = 0,
                Maximum = 100,
                Value = 5
            };

            form.Controls.Add(titleLbl);
            form.Controls.Add(subLbl);
            form.Controls.Add(bar);

            form.Shown += async (s, e) =>
            {
                try
                {
                    Directory.CreateDirectory(targetDir);
                    string distDir = Path.Combine(targetDir, "node_modules", "electron", "dist");
                    Directory.CreateDirectory(distDir);

                    using (WebClient wc = new WebClient())
                    {
                        wc.Headers.Add("User-Agent", "KoraInstaller/2.0");
                        int step = 0;
                        foreach (string file in APP_FILES)
                        {
                            subLbl.Text = "Synchronisation de " + file + "...";
                            string url = GITHUB_RAW + "/" + file + "?t=" + DateTime.UtcNow.Ticks;
                            string dest = Path.Combine(targetDir, file);
                            await wc.DownloadFileTaskAsync(new Uri(url), dest);
                            step++;
                            bar.Value = Math.Min(40, 5 + step * 3);
                        }

                        // Copy launcher itself as Kora.exe in targetDir
                        string selfPath = Application.ExecutablePath;
                        string localKoraExe = Path.Combine(targetDir, "Kora.exe");
                        if (!string.Equals(selfPath, localKoraExe, StringComparison.OrdinalIgnoreCase))
                        {
                            File.Copy(selfPath, localKoraExe, true);
                        }

                        string electronExe = Path.Combine(distDir, "electron.exe");
                        if (!File.Exists(electronExe))
                        {
                            subLbl.Text = "Téléchargement du moteur graphique Kora (1 seule fois)...";
                            string zipPath = Path.Combine(targetDir, "runtime.zip");
                            wc.DownloadProgressChanged += (sender, ev) =>
                            {
                                int pct = 40 + (int)(ev.ProgressPercentage * 0.52);
                                if (pct >= bar.Minimum && pct <= bar.Maximum) bar.Value = pct;
                            };
                            await wc.DownloadFileTaskAsync(new Uri(ELECTRON_ZIP_URL), zipPath);

                            subLbl.Text = "Finalisation de l'installation...";
                            bar.Value = 95;
                            await Task.Run(() =>
                            {
                                ZipFile.ExtractToDirectory(zipPath, distDir);
                                File.Delete(zipPath);
                            });
                        }

                        bar.Value = 100;
                        subLbl.Text = "Kora est prête ! Lancement...";
                        await Task.Delay(350);
                        LaunchKora(electronExe, targetDir);
                        form.Close();
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Impossible de terminer le téléchargement automatique : " + ex.Message,
                        "Kora — par Mr Paul",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                    form.Close();
                }
            };

            Application.Run(form);
        }
    }
}
