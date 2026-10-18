using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Kora — Living Notch for Windows")]
[assembly: AssemblyDescription("Lanceur officiel Kora Dynamic Island (par Mr Paul)")]
[assembly: AssemblyProduct("Kora")]
[assembly: AssemblyCompany("Mr Paul")]
[assembly: AssemblyCopyright("Copyright © 2026 Mr Paul")]
[assembly: AssemblyVersion("2.0.0.0")]
[assembly: AssemblyFileVersion("2.0.0.0")]

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
                string localAppDataKora = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Kora"
                );

                string[] candidateDirs = new string[]
                {
                    exeDir,
                    Path.GetFullPath(Path.Combine(exeDir, "..")),
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
                        ProcessStartInfo psi = new ProcessStartInfo
                        {
                            FileName = candidateElectron,
                            Arguments = ".",
                            WorkingDirectory = dir,
                            UseShellExecute = false,
                            CreateNoWindow = true,
                            WindowStyle = ProcessWindowStyle.Hidden
                        };
                        Process.Start(psi);
                        return;
                    }
                }

                MessageBox.Show(
                    "Pour installer Kora pour la première fois, lancez 'Installer-Kora.cmd' fourni dans le dossier Kora.",
                    "Kora — par Mr Paul",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Erreur au lancement de Kora : " + ex.Message,
                    "Kora — par Mr Paul",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
