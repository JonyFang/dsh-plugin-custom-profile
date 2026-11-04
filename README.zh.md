# dsh-plugin-custom-profile

[English](README.md)

左下角换成你自己的昵称和头像。只改这台电脑上看到的样子，不动账号，也不上传。

> 插件 id 是 `plugin-custom-profile`，包名是 `dsh-plugin-custom-profile`。

在 **设置 → 个人资料** 里改。

![昵称和头像是怎么换上的](.archify/architecture-plugin-custom-profile-20261104-195425/plugin-custom-profile.gif)

## 安装

应用里打开 **设置 → 插件 → 安装 → 本地目录**，选这个仓库。包发布之后，也可以直接搜 `dsh-plugin-custom-profile`。

或者先退出应用：

```sh
dsh plugin --profile desktop add /绝对路径/dsh-plugin-custom-profile
```

其他 profile 用 `dsh plugin --profile <profile> add dsh-plugin-custom-profile`，或 `github:<your-account>/dsh-plugin-custom-profile`。不用构建。

要自己装，把这个目录软链接到 profile 的 `node_modules`，再在 `cordis.patch.yml` 末尾加上：

```yaml
- insert:
    - id: plugin-custom-profile
      name: dsh-plugin-custom-profile
```

设置里没有 **个人资料**，就重启一次。

## 怎么用

![个人资料里换上了头像和昵称「强尼」，左下角账号行是同一套。](docs/use-zh.png)

改好昵称和头像，点 **保存**。昵称留空就是账号原来的名字。点 **恢复默认** 再保存，换回原来的样子。**取消** 丢掉没保存的修改。

图片用 PNG、JPG、WebP、GIF 或 AVIF，最大 10 MB。裁成正方形，存成 128×128 的 WebP，不行就用 PNG。GIF 不会动。昵称最多 32 个字符。

## 另外

- 没登录时不动左下角。侧边栏收起时只换头像。
- 这套显示跟着这台设备，不跟着账号。清掉站点数据，或者换一台电脑，就没了。
- 不要和另一个也在改左下角的插件一起开。这里不会导入它存过的值。
- 对照的客户端是 `0.2.2-rc.1`。账号行的标记变了，插件就不再画，也不会把页面弄坏。

## 开发

Node `^22.19.0 || >=24.0.0`。`npm test`，57 个测试。`lib/index.js` 是空的，浏览器里跑的是 `lib/client.js`。每天有一个 GitHub Action 看[Harness 页面](https://www.deepseek.com/en/harness/)。客户端有新版本，就给 `dsh-compat` agent 开一个 issue。

## License

MIT
