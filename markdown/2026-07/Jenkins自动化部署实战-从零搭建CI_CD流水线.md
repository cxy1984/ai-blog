# 从零搭建 Jenkins CI/CD 流水线：一个 Spring Boot 项目的自动化部署实战

## 写在前面

我手上有一个 Spring Boot 项目（代号 auctionNew），之前每次上线流程是这样的：

> 本地 Windows 上 `mvn package` → 手动 SCP 上传到服务器 → SSH 登录 → `kill` 旧进程 → `nohup` 启动新进程 → 刷新浏览器看有没有起来

三个环境（dev / test / pro）、多台机器来回切换，漏一步就要排查半天。痛定思痛，决定用 Jenkins 把这一套流程全自动化。

这篇文章完整记录了从零搭建到跑通 CI/CD 的全过程，包括踩过的坑和解决方案。

---

## 一、环境情况

项目技术栈：Spring Boot 2.6.4 + MyBatis Plus + JDK 8 + Maven，代码托管在 SVN。

服务器有三台：

| 机器 | IP | 角色 |
|---|---|---|
| SVN 服务器 | xxx.xxx.xxx.18（内网）/ xxx.xxx.xxx.118（公网） | 代码仓库（VisualSVN） |
| Jenkins 服务器 | xxx.xxx.xxx.197 | 构建调度（CentOS 7） |
| 测试服务器 | xxx.xxx.xxx.175 | 应用运行（CentOS 7） |

目标流水线：

```
SVN 拉代码 → Maven 编译 → 发送 JAR 到 175 → 停旧进程 → 备份 → 启动 → 健康检查
```

---

## 二、Jenkins 环境准备（197 服务器）

### 2.1 安装 Maven

CentOS 7 已经 EOL，`yum install maven` 只能装到 3.0.5（2011 年版本），Spring Boot 项目完全跑不动。

直接到 Apache 归档站下载 3.8.6：

```bash
cd /usr/local
wget https://archive.apache.org/dist/maven/maven-3/3.8.6/binaries/apache-maven-3.8.6-bin.tar.gz
tar -zxvf apache-maven-3.8.6-bin.tar.gz
ln -sf /usr/local/apache-maven-3.8.6/bin/mvn /usr/local/bin/mvn
```

> 中间试了清华镜像、阿里云镜像、Apache 官方源，要么 403 要么 404，最后 `archive.apache.org` 成功了，虽然慢（15KB/s，下了 9 分钟），但好歹能用。

### 2.2 配置 Maven 镜像

Maven 3.8+ 默认禁止 HTTP 仓库，项目里引用的阿里云镜像恰恰是 HTTP 的，编译直接报错：

```
Blocked mirror for repositories: [central (http://maven.aliyun.com/...)]
```

在 `/usr/local/apache-maven-3.8.6/conf/settings.xml` 配一个 HTTPS 镜像解决：

```xml
<mirrors>
    <mirror>
        <id>aliyun</id>
        <mirrorOf>central</mirrorOf>
        <url>https://maven.aliyun.com/repository/public</url>
    </mirror>
</mirrors>
```

### 2.3 JDK 双版本共存

Jenkins 本身需要 JDK 11+（系统装的 Amazon Corretto 21），但项目是用 JDK 8 开发的。

试着用 JDK 21 编译，报了经典错误：

```
Fatal error compiling: java.lang.NoSuchFieldError: 
Class com.sun.tools.javac.tree.JCTree$JCImport does not have member field 'qualid'
```

`maven-compiler-plugin:3.8.1` 不兼容 JDK 21。解决方案是保留 JDK 21 给 Jenkins 用，额外装 JDK 8 给 Maven 编译用：

```bash
# 安装 JDK 8（Amazon Corretto）
wget https://corretto.aws/downloads/latest/amazon-corretto-8-x64-linux-jdk.rpm
rpm -ivh amazon-corretto-8-x64-linux-jdk.rpm

# 结果：/usr/lib/jvm/java-1.8.0-amazon-corretto
```

Pipeline 里编译前切一下环境变量：

```groovy
sh "export JAVA_HOME=/usr/lib/jvm/java-1.8.0-amazon-corretto && mvn clean package"
```

Jenkins 继续用 JDK 21，Maven 用 JDK 8，互不影响。

---

## 三、SVN 连接问题——花最多时间的坑

### 3.1 问题现象

SVN 公网地址是 `https://xxx.xxx.xxx.118/svn/DOC/SOURCE/Java/auctionNew`，在本地 Windows 上完全正常。

但在同机房的 Jenkins 服务器（197）上，无论是命令行 `svn` 还是 Jenkins 内置的 SVNKit，都报：

```
svn: E175002: OPTIONS request failed on '/svn/DOC/SOURCE/Java/auctionNew'
400 Bad Request
```

### 3.2 排查过程

```
ping xxx.xxx.xxx.118       ✅ 通（延迟 0.3ms，同机房）
443 端口                   ✅ 通
curl https://xxx.xxx.xxx.118/svn/DOC/   ❌ 301 无 Location 头
curl https://xxx.xxx.xxx.118/svn/DOC/SOURCE/...  ❌ Empty reply from server
```

从响应头发现 `Server: AR`——这是**华为 AR 路由器**在中间。SVN 的真实服务器躲在华为 AR 后面，AR 对外做 SSL 终结和反向代理。

### 3.3 根因：NAT Hairpin（回环问题）

网络拓扑大概是这样的：

```
外网用户（你本地 Windows）
   │
   ▼
xxx.xxx.xxx.118（华为 AR 公网 IP）
   │  NAT 转发
   ▼
xxx.xxx.xxx.18（SVN 真实内网 IP）      ← 正常工作


内网机器（Jenkins 197）
   │
   ▼
xxx.xxx.xxx.118（华为 AR 公网 IP）
   │  ⚠️ 路由器不知道怎么把从内网来的请求"折回"内网
   ▼
400 Bad Request / 301 无 Location
```

这就是经典的 **NAT Hairpin（也叫 NAT Loopback）**——从内网访问网关的公网 IP，路由器无法正确处理。

### 3.4 解决

直接用 SVN 的内网 IP `xxx.xxx.xxx.18`，绕过华为 AR：

```
旧：https://xxx.xxx.xxx.118/svn/DOC/SOURCE/Java/auctionNew  ❌
新：https://xxx.xxx.xxx.18/svn/DOC/SOURCE/Java/auctionNew    ✅
```

直连 VisualSVN Server，Host key 提示接受一下，认证通过，一切正常。

---

## 四、SSH 免密配置

Jenkins 需要 SSH 到 175 执行部署命令。175 的 SSH 端口是 **65522**（非默认 22）。

坑：Jenkins 服务以 `jenkins` 用户运行，而平时手动操作的密钥配在了 `root` 用户下。

```bash
# 为 jenkins 用户生成密钥
su - jenkins -s /bin/bash -c "ssh-keygen -t rsa -b 2048 -N '' -f /var/lib/jenkins/.ssh/id_rsa"

# 复制公钥到 175
cat /var/lib/jenkins/.ssh/id_rsa.pub | ssh -p 65522 root@xxx.xxx.xxx.175 \
  "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"

# 验证免密登录
su - jenkins -s /bin/bash -c "ssh -p 65522 root@xxx.xxx.xxx.175 hostname"
```

---

## 五、Pipeline 脚本

最终可用的 Jenkinsfile：

```groovy
pipeline {
    agent any

    environment {
        SVN_URL = "https://xxx.xxx.xxx.18/svn/DOC/SOURCE/Java/auctionNew"
        MAVEN_HOME = "/usr/local/apache-maven-3.8.6"
        JAVA_HOME = "/usr/lib/jvm/java-1.8.0-amazon-corretto"
        REMOTE_USER = "root"
        APP_PORT = "9099"
        SSH_PORT = "65522"
        REMOTE_HOST = "xxx.xxx.xxx.175"
        REMOTE_DIR = "/data/workspace/auctionNew"
        PROJECT_DIR = "auctionNew"
    }

    stages {

        // 1. 拉取代码
        stage("SVN Checkout") {
            steps {
                checkout([$class: 'SubversionSCM',
                    locations: [[credentialsId: 'svn-account', depthOption: 'INFINITY',
                        ignoreExternalsOption: true, remote: "${SVN_URL}"]],
                    workspaceUpdater: [$class: 'UpdateUpdater']])
            }
        }

        // 2. 编译
        stage("Maven Build") {
            steps {
                sh """
                    export JAVA_HOME=${JAVA_HOME}
                    export PATH=\$JAVA_HOME/bin:\$PATH
                    cd \$WORKSPACE/${PROJECT_DIR}
                    ${MAVEN_HOME}/bin/mvn clean package -Dmaven.test.skip=true
                """
            }
        }

        // 3. 部署
        stage("Deploy") {
            steps {
                // 发送 JAR
                sh "ssh -p ${SSH_PORT} -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} 'mkdir -p ${REMOTE_DIR}'"
                sh "scp -P ${SSH_PORT} -o StrictHostKeyChecking=no \$WORKSPACE/${PROJECT_DIR}/target/auctionNew.jar ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"
                
                // 在 175 上：停服 → 备份 → 启动
                sh """
                    ssh -p ${SSH_PORT} -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} '
                        port=${APP_PORT}
                        job=auctionNew

                        # 停止旧进程
                        pid=\$(netstat -tlnp 2>/dev/null | grep \${port} | awk "{print \\\$7}" | awk -F/ "{print \\\$1}")
                        [ -n "\$pid" ] && kill -9 \$pid && sleep 2

                        # 备份 & 替换
                        mkdir -p /data/\${job}/jar /data/\${job}/logs
                        [ -f /data/\${job}/jar/\${job}.jar ] && mv /data/\${job}/jar/\${job}.jar /data/\${job}/jar/\${job}-\$(date "+%Y%m%d%H%M%S").jar
                        cp ${REMOTE_DIR}/\${job}.jar /data/\${job}/jar/\${job}.jar
                        chmod 755 /data/\${job}/jar/\${job}.jar

                        # 启动
                        nohup /usr/bin/java -server \\
                            -Xms512M -Xmx512M -XX:MetaspaceSize=256M -XX:MaxMetaspaceSize=256M \\
                            -XX:+UseG1GC -XX:+HeapDumpOnOutOfMemoryError \\
                            -XX:HeapDumpPath=/data/\${job}/logs/dump.hprof \\
                            -Xloggc:/data/\${job}/logs/gc.log \\
                            -Dfile.encoding=UTF-8 -Dspring.profiles.active=test \\
                            -jar /data/\${job}/jar/\${job}.jar --server.port=\${port} \\
                            > /data/\${job}/logs/info.log 2>&1 &
                        sleep 3
                        ps -ef | grep \${job}.jar | grep -v grep && echo "Started OK" || echo "Start Failed"
                    '
                """
            }
        }

        // 4. 健康检查
        stage("Health Check") {
            steps {
                script {
                    for (int i = 0; i < 30; i++) {
                        sleep 2
                        def code = sh(returnStdout: true,
                            script: "curl -s -o /dev/null -w '%{http_code}' http://${REMOTE_HOST}:${APP_PORT}").trim()
                        if (code == "200" || code == "404" || code == "302") {
                            echo "Application is UP (HTTP ${code})"
                            return
                        }
                    }
                    error "Health check failed after 60 seconds"
                }
            }
        }
    }
}
```

---

## 六、文件流转全景

整个部署过程中，文件经历了以下流转：

```
SVN 仓库（xxx.xxx.xxx.18）
     │  checkout（Jenkins SubversionSCM）
     ▼
197：/var/lib/jenkins/workspace/auctionNew-test/auctionNew/
     │  Maven compile + package
     ▼
197：/var/lib/.../target/auctionNew.jar
     │  scp（端口 65522）
     ▼
175：/data/workspace/auctionNew/auctionNew.jar         ← 中转站
     │  cp
     ▼
175：/data/auctionNew/jar/auctionNew.jar               ← 运行位置
     │  nohup java -jar
     ▼
175：日志 → /data/auctionNew/logs/{info.log, gc.log}
```

175 上最终的文件布局：

```
/data/
├── workspace/auctionNew/       ← 中转（每次 scp 覆盖）
│   └── auctionNew.jar
└── auctionNew/                 ← 运行目录
    ├── jar/
    │   ├── auctionNew.jar          ← 当前运行
    │   └── auctionNew-YYYYMMDDHHmmss.jar  ← 上一次备份
    └── logs/
        ├── info.log               ← 应用日志
        └── gc.log                 ← GC 日志
```

---

## 七、踩坑总结

| 坑 | 现象 | 解决方案 |
|---|---|---|
| **NAT Hairpin** | 内网访问公网 SVN 返回 400 | 改用内网 IP 直连 |
| **JDK 版本不兼容** | `NoSuchFieldError: JCImport.qualid` | 装 JDK 8，编译时切换 JAVA_HOME |
| **Maven HTTP 被拦截** | `Blocked mirror for repositories` | settings.xml 改用 HTTPS 镜像 |
| **Yum 源失效** | CentOS 7 EOL，mirrorlist 不可用 | `--disablerepo=centos-sclo*` 或手动下载 RPM |
| **Maven 太老** | yum 只能装 3.0.5 | 从 archive.apache.org 下载 3.8.6 |
| **SSH Host Key** | Jenkins 用户无 known_hosts | 为 `/var/lib/jenkins/.ssh` 单独配置 |
| **deleteDir 权限** | SVN 文件只读导致清理失败 | 去掉 Clean 阶段，用 UpdateUpdater |
| **Spring Profile** | 误用 `-Denv=test` 而非 Spring 标准 | 改为 `-Dspring.profiles.active=test` |

---

## 八、最终效果

现在部署只需要两步：

1. 本地 `svn commit` 提交代码
2. 打开 Jenkins → Build Now

2~3 分钟后，175 上的应用自动更新完毕。整个过程：

- ✅ SVN 自动拉取最新代码
- ✅ Maven 自动编译打包（JDK 8 环境）
- ✅ SCP 自动传送到测试服务器
- ✅ 自动停止旧进程
- ✅ 自动备份旧 JAR
- ✅ 自动启动新进程
- ✅ 自动健康检查验证

出问题直接看日志：`tail -f /data/auctionNew/logs/info.log`

---

## 九、后续优化方向

- 加入 Spring Boot Actuator 实现更精准的健康检查（`/actuator/health`）
- 配置 SVN Webhook 或 Poll SCM 实现提交即触发
- 多版本备份保留（目前只保留一份）
- 健康检查失败自动回滚到上一版本
- 生产环境部署只需复制一份 Pipeline，改 IP 和 Profile 即可
