using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Kora — Living Notch for Windows")]
[assembly: AssemblyDescription("One-Click Launcher & Setup for Kora Dynamic Island")]
[assembly: AssemblyProduct("Kora")]
[assembly: AssemblyVersion("1.2.0.0")]

namespace KoraLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string[] candidateDirs = new string[]
                {
                    exeDir,
                    Path.GetFullPath(Path.Combine(exeDir, "..")),
                    Path.GetFullPath(Path.Combine(exeDir, "..", "..")),
                    Path.Combine(desktop, "Progammation", "Kora"),
                    Path.Combine(desktop, "Programmation", "Kora"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Kora"),
                    @"C:\Users\DELL\Desktop\Progammation\Kora",
                    @"C:\Users\DELL\.gemini\antigravity\scratch\nusa-notch"
                };

                string appDir = null;
                string electronExe = null;

                foreach (string dir in candidateDirs)
                {
                    if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) continue;
                    string candidateElectron = Path.Combine(dir, "node_modules", "electron", "dist", "electron.exe");
                    string candidateMain = Path.Combine(dir, "main.js");
                    if (File.Exists(candidateElectron) && File.Exists(candidateMain))
                    {
                        appDir = dir;
                        electronExe = candidateElectron;
                        break;
                    }
                }

                if (appDir != null && electronExe != null)
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
                else
                {
                    MessageBox.Show(
                        "Kora n'a pas trouvé les fichiers d'exécution dans ce dossier.\nAssurez-vous que Kora.exe se trouve dans le dossier Kora.",
                        "Kora — Living Notch",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erreur au lancement de Kora : " + ex.Message, "Kora", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
