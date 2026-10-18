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
            string localAppDataKora = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Kora"
            );
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;

            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

                string[] candidateDirs = new string[]
                {
                    localAppDataKora,
                    exeDir,
                    Path.GetFullPath(Path.Combine(exeDir, "..")),
                    Path.Combine(desktop, "Progammation", "Kora"),
                    Path.Combine(desktop, "Programmation", "Kora")
                };

                foreach (string dir in candidateDirs)
                {
                    if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) continue;
                    string candidateElectron = Path.Combine(dir, "node_modules", "electron", "dist", "electron.exe");
                    string candidateMain = Path.Combine(dir, "main.js");
                    if (File.Exists(candidateElectron) && File.Exists(candidateMain))
                    {
                        FileInfo fi = new FileInfo(candidateElectron);
                        // Si le binaire est tronqué ou vide (< 20 Mo), c'est un téléchargement incomplet
                        if (fi.Length < 20000000)
                        {
                            try { File.Delete(candidateElectron); } catch {}
                            continue;
                        }

                        try
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
                        catch (Exception ex)
                        {
                            try { File.Delete(candidateElectron); } catch {}
                            DialogResult repairChoice = MessageBox.Show(
                                "Le moteur graphique Kora a rencontré une incompatibilité avec votre version de Windows :\n\n" +
                                ex.Message + "\n\n" +
                                "Voulez-vous lancer la configuration automatique optimisée pour votre PC (Windows 7 / 8 / 10 / 11, 32-bit ou 64-bit) ?",
                                "Kora — Configuration requise",
                                MessageBoxButtons.YesNo,
                                MessageBoxIcon.Warning
                            );

                            if (repairChoice == DialogResult.Yes)
                            {
                                LaunchRepair(dir, localAppDataKora);
                            }
                            return;
                        }
                    }
                }

                DialogResult dr = MessageBox.Show(
                    "Kora n'est pas encore configurée sur cet ordinateur ou des fichiers sont manquants.\n\n" +
                    "Voulez-vous lancer l'installation automatique ?",
                    "Kora — par Mr Paul",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Information
                );

                if (dr == DialogResult.Yes)
                {
                    LaunchRepair(exeDir, localAppDataKora);
                }
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

        static void LaunchRepair(string currentDir, string localAppDataDir)
        {
            try
            {
                string localCmd = Path.Combine(currentDir, "Installer-Kora.cmd");
                string appDataPs1 = Path.Combine(localAppDataDir, "install.ps1");

                if (File.Exists(localCmd))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = localCmd,
                        WorkingDirectory = currentDir,
                        UseShellExecute = true
                    });
                }
                else if (File.Exists(appDataPs1))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "powershell.exe",
                        Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + appDataPs1 + "\"",
                        UseShellExecute = true
                    });
                }
                else
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "powershell.exe",
                        Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"iwr -useb https://kora-nine.vercel.app/install.ps1 | iex\"",
                        UseShellExecute = true
                    });
                }
            }
            catch
            {
                Process.Start("https://kora-nine.vercel.app");
            }
        }
    }
}
