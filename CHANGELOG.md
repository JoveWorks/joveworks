# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.2.0](https://github.com/ThomasVanRiel/machine-design-studio/compare/v0.1.0...v0.2.0) (2026-08-16)

### Features

* add a slider ValueSpec kind for quick nudging ([ae86082](https://github.com/ThomasVanRiel/machine-design-studio/commit/ae860826d4be3865f34d061c84cb51d13701ad52))
* add the equation output node (ROADMAP.md) ([066afce](https://github.com/ThomasVanRiel/machine-design-studio/commit/066afce33552a93438b05a86a07851cafddf133e))
* **editor:** a plot's threshold as an optional override port ([6443e02](https://github.com/ThomasVanRiel/machine-design-studio/commit/6443e027b7d125e1458583fc7bdea2a4840a7edc))
* **editor:** auto-restore autosave silently; New and Recent in the File ribbon ([3063968](https://github.com/ThomasVanRiel/machine-design-studio/commit/3063968d2e39460196b037ff8baad503ae31c48b))
* **editor:** autosave to localStorage with restore-on-load prompt ([f7ddf88](https://github.com/ThomasVanRiel/machine-design-studio/commit/f7ddf882e6be6c3b661ad879f47e550b34ad3c0c))
* **editor:** glob the catalogues directory instead of a hardcoded file ([91b9f49](https://github.com/ThomasVanRiel/machine-design-studio/commit/91b9f49c66574323c04727380d375df2c005115f))
* **editor:** notebook section titles are editable in the notebook ([258e9d7](https://github.com/ThomasVanRiel/machine-design-studio/commit/258e9d7e8cbe1070409dc76d23637490e94f15ee))
* **editor:** show app version in the ribbon; document title moves into the notebook ([fc88ad5](https://github.com/ThomasVanRiel/machine-design-studio/commit/fc88ad50955f9ed01ad6f7090a14160afc525181))

### Fixes

* **editor:** a section drag could still drop as text on the notebook title ([42fe446](https://github.com/ThomasVanRiel/machine-design-studio/commit/42fe446e8b977076d6af75e55597bd38d3f13682))
* **editor:** adapt an unwired input node's unit to its target on connect ([c058a6f](https://github.com/ThomasVanRiel/machine-design-studio/commit/c058a6fc9c97722c7135450d593f41ee4daf0aef))
* **editor:** align palette hints in their own column ([076b1ef](https://github.com/ThomasVanRiel/machine-design-studio/commit/076b1efe5531dc83d6030fcea6aa0eb15c8d6599))
* **editor:** auto-size a plot's threshold field ([9db5fec](https://github.com/ThomasVanRiel/machine-design-studio/commit/9db5fecf87e37c9d1e41e252fb6f166bbea91931))
* **editor:** drop cleanup was skippable, letting the line get stuck ([bff8e31](https://github.com/ThomasVanRiel/machine-design-studio/commit/bff8e31f64ace70b6f18db3197b7b14aa01ddbb2))
* **editor:** left-align the "Not in a section" pseudo-header title ([92f7cb9](https://github.com/ThomasVanRiel/machine-design-studio/commit/92f7cb9b2167a0f0314f1f960dfddbae35dd1798))
* **editor:** make the drag handle the flex gap, not the tiny grip icon ([34ec4f5](https://github.com/ThomasVanRiel/machine-design-studio/commit/34ec4f539f996db69e05b8c6162747c905a2bc4b))
* **editor:** move formula verified/source badges into the dropdown ([66504fc](https://github.com/ThomasVanRiel/machine-design-studio/commit/66504fc3e66f84f5c6b1b251eea65405b935e524))
* **editor:** normalise after-A/before-B into one canonical drop state ([5396da5](https://github.com/ThomasVanRiel/machine-design-studio/commit/5396da59dc4a459f59ba4a785a5ebc44a5f6d6d0))
* **editor:** one shared drag-over state, not one per section ([4800f0a](https://github.com/ThomasVanRiel/machine-design-studio/commit/4800f0abae9a33c8c6b7b52e62d1907a41b12c38))
* **editor:** reorder dropdown provenance, label the catalogue source ([4f7a105](https://github.com/ThomasVanRiel/machine-design-studio/commit/4f7a10553305c72dcdbe2714bd111f8100d011c9))
* **editor:** ribbon buttons stay clickable while a menu is open ([c52e6a5](https://github.com/ThomasVanRiel/machine-design-studio/commit/c52e6a545630b0ef9f1ce29af366c8c8187a4b8b))
* **editor:** ribbon dropdown stays open on a short close delay ([27d7d3f](https://github.com/ThomasVanRiel/machine-design-studio/commit/27d7d3fc5c9f781abbe9d2bf591ac21c986032b2))
* **editor:** round a slider's dragged value, and wrap its detail row ([7f82f0f](https://github.com/ThomasVanRiel/machine-design-studio/commit/7f82f0fd0cdbe72315b40ba29ea1d89a8da8cbe7))
* **editor:** scope drag-to-reorder to the grip, not the whole section ([62e77ed](https://github.com/ThomasVanRiel/machine-design-studio/commit/62e77ed5bfbc216cc192bbd6227ec598738ca11b))
* **editor:** section frames respect selection, resize, and read order ([0d6c6e1](https://github.com/ThomasVanRiel/machine-design-studio/commit/0d6c6e1797488f1d23c66cde4a2456d5909b27bc))
* **editor:** section title/note/caption fields lost double-click select ([60cc52d](https://github.com/ThomasVanRiel/machine-design-studio/commit/60cc52d2f1faba105fb849e2b2d42ba97fc106b2))
* **editor:** show catalogue source on canvas formula nodes ([6367c2c](https://github.com/ThomasVanRiel/machine-design-studio/commit/6367c2c26f263f8aff05b2172702a13bc36b1720))
* **editor:** size section-title to its text, not the whole row ([39962bb](https://github.com/ThomasVanRiel/machine-design-studio/commit/39962bb46bebf7f500b1292d61022ef9389db3ac))
* **editor:** slider input dragged the node instead of the thumb ([9c28f29](https://github.com/ThomasVanRiel/machine-design-studio/commit/9c28f29bf62a4c1f82cf54061df60b0a5f3c8e40))
* **editor:** widen default palette panel ([a82a2ed](https://github.com/ThomasVanRiel/machine-design-studio/commit/a82a2ed46356293d0e250e6e662ad1a593b3e194))

### Documentation

* clarify worktree agents commit freely, just not merge to main ([803358a](https://github.com/ThomasVanRiel/machine-design-studio/commit/803358ab4af49d5e1d58961c4e3b66bbdfc27968))
* drop shipped closure-node item from the roadmap ([9dcf1a4](https://github.com/ThomasVanRiel/machine-design-studio/commit/9dcf1a46abf4493eb627e0a1edab3cf0063b712c))
* drop shipped items from the roadmap ([0586900](https://github.com/ThomasVanRiel/machine-design-studio/commit/0586900ba2cccb098b092791a94951fcde1b5aed))
* drop the resolved section-frame items from the roadmap ([2c6e24b](https://github.com/ThomasVanRiel/machine-design-studio/commit/2c6e24b9efbba6e03ca4686b9c4da253dd544471))
* note check output node missing a threshold port like plot ([82ccd2d](https://github.com/ThomasVanRiel/machine-design-studio/commit/82ccd2d4abef4b2f295dd51176e4452cbce20dd9))
* reframe editor backlog items on the roadmap ([a119c61](https://github.com/ThomasVanRiel/machine-design-studio/commit/a119c61398f7d966839b73c14e12ae417526fd0d))
* require checking a worktree branch's work before merging ([92f779d](https://github.com/ThomasVanRiel/machine-design-studio/commit/92f779da7d22f2145156a6d2ea9946b16d2d2a21))
* spell out Conventional Commits types and scope rules ([a138245](https://github.com/ThomasVanRiel/machine-design-studio/commit/a138245cf5d435f93967e4153d7b48aa7997f8b9))
* update roadmap for CI disable, v0.1.0, and the catalogue glob ([f29907a](https://github.com/ThomasVanRiel/machine-design-studio/commit/f29907a9e79f4f89c0d540e3e8296c845b4d017a))
## 0.1.0 (2026-08-16)

### Fixes

* a bare compare threshold used value's canonical unit, not its display unit ([03d1012](https://github.com/ThomasVanRiel/machine-design-studio/commit/03d10129af479c52dff3cf6a7f6f9bb184ef9a4d))
* a fresh compare node's threshold refused to wire to any dimensioned value ([c954073](https://github.com/ThomasVanRiel/machine-design-studio/commit/c954073601b2b60f03fa1201f90b357245e91163))
* a table column's name froze at wire time, never following a rename ([4f03e53](https://github.com/ThomasVanRiel/machine-design-studio/commit/4f03e536741b2dea2e65576ad8e423e410df5bab))
* engineering notation showed a bare e+0 for values already in range ([2905585](https://github.com/ThomasVanRiel/machine-design-studio/commit/290558557eeac56d98c5a5a8c4a1e79cef7e9ca8))
* switching an output node's kind stranded its existing wire ([a485b84](https://github.com/ThomasVanRiel/machine-design-studio/commit/a485b84d3841e3c6cb8f4f2b0b2c459de204ddc7))
* the quick-add menu couldn't create a compare or table node ([fcf0edf](https://github.com/ThomasVanRiel/machine-design-studio/commit/fcf0edf8f3cac50968ae35d59950b10b49ba23d8))

### Documentation

* settle S74 and update UI-FEEDBACK.md and NEXT.md for the second pass ([409537f](https://github.com/ThomasVanRiel/machine-design-studio/commit/409537f0c1a20bf6ded01f7cce87542e3f5f9ea5))
