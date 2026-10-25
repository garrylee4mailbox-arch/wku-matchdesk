using System;
using System.IO;
using System.Text;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;
using System.Security.Cryptography;

namespace WkuMatchDesk {
  static class Program {
    static readonly object Gate = new object();
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024, RecursionLimit = 200 };
    static string DataDir, StateFile, UiDir, Token, Url;
    static TcpListener Listener;
    static NotifyIcon Tray;
    static bool Closing;
    static long Revision;
    static object Data;
    static Mutex Single;
    [STAThread] static void Main() {
      try {
        Application.EnableVisualStyles();
        DataDir = Environment.GetEnvironmentVariable("WKU_DATA_DIR");
        if (String.IsNullOrEmpty(DataDir)) DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WKU MatchDesk", "data");
        DataDir = Path.GetFullPath(DataDir);
        bool created; string mutexId;
        using (var sha = SHA256.Create()) mutexId = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(DataDir.ToLowerInvariant()))).Replace("-", "");
        Single = new Mutex(true, "Local\\WKU-MatchDesk-" + mutexId, out created);
        if (!created) { MessageBox.Show("比赛记录系统已在运行，请从任务栏右下角绿色图标打开。", "WKU 比赛记录"); return; }
        Directory.CreateDirectory(DataDir); Directory.CreateDirectory(Path.Combine(DataDir, "backups"));
        StateFile = Path.Combine(DataDir, "state.json"); UiDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ui");
        if (!Directory.Exists(UiDir)) throw new Exception("找不到 ui 文件夹。请先完整解压使用包，再双击启动。");
        if (File.Exists(StateFile)) {
          // Refuse to overwrite an unreadable database with a fresh empty one.
          var root = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(StateFile, Encoding.UTF8));
          Revision = Convert.ToInt64(root["revision"]); Data = root["data"]; CheckData(Data);
        }
        byte[] secret = new byte[32]; using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(secret);
        Token = BitConverter.ToString(secret).Replace("-", "").ToLowerInvariant();
        Listener = new TcpListener(IPAddress.Loopback, 0); Listener.Start();
        Url = "http://127.0.0.1:" + ((IPEndPoint)Listener.LocalEndpoint).Port;
        File.WriteAllText(Path.Combine(DataDir, "session.json"), Json.Serialize(new { url = Url, token = Token, pid = Process.GetCurrentProcess().Id }), new UTF8Encoding(false));
        var accept = new Thread(AcceptLoop); accept.IsBackground = true; accept.Start();
        Tray = new NotifyIcon { Icon = SystemIcons.Application, Text = "WKU 羽毛球比赛记录", Visible = true };
        var menu = new ContextMenuStrip();
        menu.Items.Add("打开比赛记录", null, delegate { Open(); });
        menu.Items.Add("打开数据文件夹", null, delegate { Process.Start(new ProcessStartInfo(DataDir) { UseShellExecute = true }); });
        menu.Items.Add("退出（数据已自动保存）", null, delegate { Application.Exit(); });
        Tray.ContextMenuStrip = menu; Tray.DoubleClick += delegate { Open(); };
        Application.ApplicationExit += delegate { Closing = true; Listener.Stop(); Tray.Visible = false; Tray.Dispose(); try { File.Delete(Path.Combine(DataDir,"session.json")); } catch { } };
        if (Environment.GetEnvironmentVariable("WKU_NO_BROWSER") != "1") Open();
        Application.Run();
      } catch (Exception e) {
        if (Environment.GetEnvironmentVariable("WKU_NO_BROWSER") == "1") { try { File.WriteAllText(Path.Combine(DataDir,"startup-error.txt"),e.ToString()); } catch { } }
        else MessageBox.Show("启动失败：" + e.Message + "\n\n已有数据不会清除。如 state.json 损坏，请先保留原文件，再从 backups 文件夹恢复一个快照。", "WKU 比赛记录", MessageBoxButtons.OK, MessageBoxIcon.Error);
        Environment.ExitCode = 1;
      } finally { if (Single != null) Single.Dispose(); }
    }
    static void Open() { Process.Start(new ProcessStartInfo(Url + "/?boot=" + Token) { UseShellExecute = true }); }
    static void AcceptLoop() {
      while (!Closing) { try { var c = Listener.AcceptTcpClient(); ThreadPool.QueueUserWorkItem(delegate { Handle(c); }); } catch { if (Closing) return; } }
    }
    static string ReadLine(Stream stream) {
      var bytes = new List<byte>(); int b;
      while ((b = stream.ReadByte()) != -1) { if (b == 10) break; if(b != 13) bytes.Add((byte)b); if(bytes.Count > 8192) throw new Exception("HTTP header too long"); }
      return Encoding.ASCII.GetString(bytes.ToArray());
    }
    static void Handle(TcpClient client) {
      using (client) {
        client.ReceiveTimeout = 10000; client.SendTimeout = 10000;
        var stream = client.GetStream();
        try {
          string line = ReadLine(stream); var first = line.Split(' '); if (first.Length != 3) return;
          string method=first[0],target=first[1]; if(!target.StartsWith("/")) { Send(stream,400,"Invalid target"); return; }
          var headers = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
          int headerCount=0; while((line=ReadLine(stream))!="") { if(++headerCount>80)throw new Exception("Too many headers"); int i=line.IndexOf(':'); if(i>0)headers[line.Substring(0,i)]=line.Substring(i+1).Trim(); }
          // Consume the request before returning errors: closing a socket with unread
          // PUT data can reset the connection and hide a useful conflict response.
          string bodyLengthText; int bodyLength=0;
          if(headers.ContainsKey("Transfer-Encoding")){Send(stream,400,"Chunked requests are not supported");return;}
          if(headers.TryGetValue("Content-Length",out bodyLengthText) && (!Int32.TryParse(bodyLengthText,out bodyLength)||bodyLength<0||bodyLength>24*1024*1024)){Send(stream,413,"Request too large");return;}
          var requestBody=new byte[bodyLength];int received=0;while(received<bodyLength){int n=stream.Read(requestBody,received,bodyLength-received);if(n==0)throw new Exception("Incomplete request");received+=n;}
          string host; if(!headers.TryGetValue("Host",out host)||host!="127.0.0.1:"+((IPEndPoint)Listener.LocalEndpoint).Port) { Send(stream,403,"Host rejected"); return; }
          var uri = new Uri(Url+target); string path = Uri.UnescapeDataString(uri.AbsolutePath);
          if(path=="/" && uri.Query=="?boot="+Token) { Send(stream,303,"", "text/plain", "Set-Cookie: wku_session="+Token+"; HttpOnly; SameSite=Strict; Path=/\r\nLocation: /\r\n"); return; }
          string cookies; bool authenticated=headers.TryGetValue("Cookie",out cookies)&&Array.Exists(cookies.Split(';'),x=>x.Trim()=="wku_session="+Token);
          if(!authenticated) { Send(stream,401,"请从桌面程序或托盘菜单打开，当前页面没有本机访问权限。", "text/plain; charset=utf-8"); return; }
          if(path.StartsWith("/api/")) {
            string origin; if(headers.TryGetValue("Origin",out origin)&&origin!=Url) { Send(stream,403,"Origin rejected"); return; }
            if(method=="GET" && path=="/api/state") { lock(Gate) SendJson(stream,new { revision=Revision,data=Data,path=DataDir }); return; }
            if(method=="GET" && path=="/api/backups") {
              lock(Gate) { var files=new DirectoryInfo(Path.Combine(DataDir,"backups")).GetFiles("*.json"); Array.Sort(files,(a,b)=>b.Name.CompareTo(a.Name)); var result=new List<object>(); foreach(var f in files)result.Add(new {name=f.Name,bytes=f.Length,at=f.LastWriteTimeUtc.ToString("o")});SendJson(stream,result); } return;
            }
            if(method=="GET" && path.StartsWith("/api/backups/")) {
              string name=path.Substring("/api/backups/".Length); if(name!=Path.GetFileName(name)||!name.EndsWith(".json")) {Send(stream,400,"Invalid backup");return;}
              lock(Gate) { string file=Path.Combine(DataDir,"backups",name);if(!File.Exists(file))Send(stream,404,"Not found");else Send(stream,200,File.ReadAllText(file,Encoding.UTF8),"application/json; charset=utf-8"); } return;
            }
            if(method=="PUT"&&path=="/api/state") {
              string expectedText;
              if(bodyLength<1) {Send(stream,400,"Empty body");return;}
              object candidate;lock(Gate){candidate=Json.DeserializeObject(Encoding.UTF8.GetString(requestBody));CheckData(candidate);}
              lock(Gate) {
                long expected;if(!headers.TryGetValue("If-Match",out expectedText)||!Int64.TryParse(expectedText,out expected)||expected!=Revision){Send(stream,409,"数据已被另一个窗口更新。请重新载入后再操作；此次没有覆盖已保存数据。");return;}
                Persist(candidate);SendJson(stream,new {revision=Revision,savedAt=DateTime.UtcNow.ToString("o")});
              }return;
            }
            Send(stream,404,"Unknown API");return;
          }
          if(method!="GET"){Send(stream,405,"Method not allowed");return;}
          if(path=="/")path="/index.html";
          string filePath=Path.GetFullPath(Path.Combine(UiDir,path.TrimStart('/').Replace('/',Path.DirectorySeparatorChar)));
          if(!filePath.StartsWith(UiDir+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||!File.Exists(filePath)){Send(stream,404,"Not found");return;}
          string extension=Path.GetExtension(filePath),type=extension==".html"?"text/html; charset=utf-8":extension==".js"?"text/javascript; charset=utf-8":extension==".css"?"text/css; charset=utf-8":extension==".svg"?"image/svg+xml":"application/octet-stream";
          SendBytes(stream,200,File.ReadAllBytes(filePath),type,"");
        } catch(Exception e) { try { Send(stream,500,"请求未完成："+e.Message); } catch { } }
      }
    }
    static void CheckData(object data) {
      var d=data as Dictionary<string,object>;
      if(d==null||!d.ContainsKey("schema")||(string)d["schema"]!="wku-matchdesk/v1")throw new Exception("不支持的数据格式，请保留原文件并使用对应版本恢复。");
      foreach(string key in new[]{"players","events","templates","improvements","audit"}) if(!d.ContainsKey(key)||!(d[key] is System.Collections.IList))throw new Exception("数据缺少集合："+key);
      if(!d.ContainsKey("settings")||!(d["settings"] is Dictionary<string,object>))throw new Exception("设置数据缺失");
    }
    static void Persist(object candidate) {
      long next=Revision+1;string text=Json.Serialize(new {storageVersion=1,revision=next,data=candidate}),temp=StateFile+".tmp";
      var bytes=new UTF8Encoding(false).GetBytes(text);
      using(var file=new FileStream(temp,FileMode.Create,FileAccess.Write,FileShare.None)){file.Write(bytes,0,bytes.Length);file.Flush(true);}
      if(File.Exists(StateFile)) {
        string backup=Path.Combine(DataDir,"backups",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fffffff")+"-r"+Revision+".json");
        File.Replace(temp,StateFile,backup,true);
      }else File.Move(temp,StateFile);
      Data=candidate;Revision=next;
      var snapshots=new DirectoryInfo(Path.Combine(DataDir,"backups")).GetFiles("*.json");Array.Sort(snapshots,(a,b)=>b.Name.CompareTo(a.Name));
      for(int i=100;i<snapshots.Length;i++)try{snapshots[i].Delete();}catch{}
    }
    static void SendJson(Stream stream,object value){Send(stream,200,Json.Serialize(value),"application/json; charset=utf-8");}
    static void Send(Stream stream,int code,string text,string type="text/plain; charset=utf-8",string extra=""){SendBytes(stream,code,Encoding.UTF8.GetBytes(text),type,extra);}
    static void SendBytes(Stream stream,int code,byte[] bytes,string type,string extra) {
      string head="HTTP/1.1 "+code+" "+(code==200?"OK":code==303?"See Other":"Error")+"\r\nContent-Type: "+type+"\r\nContent-Length: "+bytes.Length+"\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'\r\n"+extra+"\r\n";
      var header=Encoding.ASCII.GetBytes(head);stream.Write(header,0,header.Length);stream.Write(bytes,0,bytes.Length);
    }
  }
}
