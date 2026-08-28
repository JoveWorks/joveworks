# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.22.2](https://github.com/JoveWorks/joveworks/compare/v0.22.1...v0.22.2) (2026-08-28)

### Features

* **editor:** print the notebook as a two-column journal article ([c720338](https://github.com/JoveWorks/joveworks/commit/c720338106ef406eb6a35f0537a5faab49be9de3))
* **schema:** save a catalogue as YAML ([be24c0d](https://github.com/JoveWorks/joveworks/commit/be24c0d290c49fe9b91baa4f1cae5b53e9113adf))
* **units:** offer kW in the display-unit picker ([b35712b](https://github.com/JoveWorks/joveworks/commit/b35712b928c96f617eb227d13e589d38d90bf34c))

### Fixes

* **editor:** compact display unit picker ([70eb07f](https://github.com/JoveWorks/joveworks/commit/70eb07f508eedfd3e8ccffe3b82506f024eb8688))
* **editor:** give the notebook multicol a fill mode that works auto-height ([b970405](https://github.com/JoveWorks/joveworks/commit/b97040510a3c9ed35a91095047e74709e7f24d5b))
* **editor:** let the sweep table actually fragment in print ([8b2333f](https://github.com/JoveWorks/joveworks/commit/8b2333f1abffb2824e9d63d66ed26808a72627c1))
* **editor:** make the masthead the only thing that spans in print ([5d36f0d](https://github.com/JoveWorks/joveworks/commit/5d36f0d517871ffa0db9d0d9807d51f79c3b2826))
* **editor:** name the last passing value at a check's crossing ([39d131e](https://github.com/JoveWorks/joveworks/commit/39d131efde0d7112e3c2b9a8275cfc4634d31072))
* **editor:** put the heatmap's colour key beside the chart ([c0bf1fc](https://github.com/JoveWorks/joveworks/commit/c0bf1fcbb979bd0b2c79155d8da12d20df73cfe7))
* **editor:** shorten the computed range palette summary ([2fd986e](https://github.com/JoveWorks/joveworks/commit/2fd986ed824d5a7c1b1617f2aae20bd3dac85315))
* **editor:** shrink figures into print columns instead of spanning ([6bffe1f](https://github.com/JoveWorks/joveworks/commit/6bffe1fe7391d4721279f59134ff344b6b507da4))
* **editor:** size the notebook's prose to the printed column ([cfbc344](https://github.com/JoveWorks/joveworks/commit/cfbc3444638b9714af96dc35e242c3f11c79234e))
* **editor:** stop the printed notebook stranding half-empty columns ([0d53fa8](https://github.com/JoveWorks/joveworks/commit/0d53fa893a6f8d692e0df3f44eac93a0adffa9ba))
* **editor:** typeset feasibility axis labels on the chart's own svg ([0c757a7](https://github.com/JoveWorks/joveworks/commit/0c757a719ac4196930806c442fea2887b35dd28e))
* **editor:** typeset the plot threshold reading's measure label ([d8ea24f](https://github.com/JoveWorks/joveworks/commit/d8ea24f901300af3f39ef9dd73d207a3d82f79fc))
* **editor:** typeset the printed notebook's masthead and columns ([dd678bc](https://github.com/JoveWorks/joveworks/commit/dd678bcd811bc4c5ba1352b3896831a825d4fcca))

### Documentation

* hold visual changes for review before committing them ([01eb5d5](https://github.com/JoveWorks/joveworks/commit/01eb5d5265286ea039902ff68f6dd452b37e186c))
* record how to orchestrate parallel worktree agents ([21af10e](https://github.com/JoveWorks/joveworks/commit/21af10e0d75039b7339c4d935e2b081cb9bd46c0))
* record roadmap item 16's catalogue update ([0f96474](https://github.com/JoveWorks/joveworks/commit/0f96474ea1ffc566ecb0dcc8a1af07bb7b01320c))
* **test:** point the catalogue env examples at the YAML files ([6b24c6a](https://github.com/JoveWorks/joveworks/commit/6b24c6a04d1bb8d1d82ff479da4db5852ecc361a))
* trim the roadmap to the open editor backlog ([4d6cd04](https://github.com/JoveWorks/joveworks/commit/4d6cd04ca5599bd0b10ff491c5768e4484b221ae))
## [0.22.1](https://github.com/JoveWorks/joveworks/compare/v0.22.0...v0.22.1) (2026-08-28)

### Features

* **editor:** refine notebook printing ([7a9c3d9](https://github.com/JoveWorks/joveworks/commit/7a9c3d9ea127f81f020eeb9838e82a6a6b84ad74))

### Fixes

* **editor:** compare notebook field widths in one box model ([6ab23d9](https://github.com/JoveWorks/joveworks/commit/6ab23d90cd17ba9f6d96f9db81a8f4528a22c95b))
* **editor:** drop transient canvas geometry on a document swap ([0774954](https://github.com/JoveWorks/joveworks/commit/077495493249407500a0a61897f5b0d2e76c77b7))
* **editor:** hatch feasibility fail legend ([0f22ae7](https://github.com/JoveWorks/joveworks/commit/0f22ae70b3d33a3709a648cdc54ed86406f49198))
* **editor:** keep notebook figures attached across a rerender ([51ffc4d](https://github.com/JoveWorks/joveworks/commit/51ffc4d82538b5bd394c4bac5301822eac715788))
* **editor:** typeset decorated plot labels ([22d27bf](https://github.com/JoveWorks/joveworks/commit/22d27bfa653a7743d192e5b86d531e2621528032))

### Performance

* **editor:** keep layout gestures out of evaluation ([638721f](https://github.com/JoveWorks/joveworks/commit/638721f9950f7496d305485698f4d0a6cd5699ca))

### Refactoring

* **nodes:** namespace built-in formula ids ([14647f9](https://github.com/JoveWorks/joveworks/commit/14647f949ec6ccc47ed63be131019deebc6516c6))
## [0.22.0](https://github.com/JoveWorks/joveworks/compare/v0.21.0...v0.22.0) (2026-08-28)

### ⚠ BREAKING CHANGES

* delete the spectrum concept; many values arrive by wire

### Features

* **editor:** add machining material library ([5f7db68](https://github.com/JoveWorks/joveworks/commit/5f7db680fb278114564eed17a509fbdfae4b5be1))

### Fixes

* **editor:** keep a wired port value readable when it clips ([e85f071](https://github.com/JoveWorks/joveworks/commit/e85f0714fafb07ed2cd7ae3af9327f389bc45fee))
* **editor:** move a disabled field's tooltip to its wrapper ([7f16782](https://github.com/JoveWorks/joveworks/commit/7f167826abb6efadfae51e4839cceec042b124a5))
* **editor:** restore FeasibilityFigure width and add a greyscale-safe verdict texture ([689a11a](https://github.com/JoveWorks/joveworks/commit/689a11a2cd39b73cbe11d0801aa43b77c2baf244)), references [#46](https://github.com/JoveWorks/joveworks/issues/46) [#3ca951](https://github.com/JoveWorks/joveworks/issues/3ca951) [#ff725c](https://github.com/JoveWorks/joveworks/issues/ff725c)
* **kernel:** let a discrete Monte Carlo generator take several choices per wire ([49e6bcf](https://github.com/JoveWorks/joveworks/commit/49e6bcfea288e45e434783b691ea00ba125eb985))
* **kernel:** let angle and dimensionless connect in both directions ([8c19b86](https://github.com/JoveWorks/joveworks/commit/8c19b86d0a2a01f45d485ab3c165ca86e0f917e6))
* **schema:** correct the variadic flag's stated invariant ([356ba08](https://github.com/JoveWorks/joveworks/commit/356ba089e36de13d6ad7b2315f5575dded9e0412))

### Refactoring

* delete the spectrum concept; many values arrive by wire ([8f66b0b](https://github.com/JoveWorks/joveworks/commit/8f66b0b5591f89dcfce26b8383e3c1094fe736ba))

### Documentation

* drop the content sign-off section from the roadmap ([286984a](https://github.com/JoveWorks/joveworks/commit/286984a14951d0274d2eb55fb3b0b42f21ea147d))
* finish removing docs/PLAN.md and docs/UX-SPEC.md references ([a3228cc](https://github.com/JoveWorks/joveworks/commit/a3228cc1f3801e6fbb2ec37bd6d1ea791a69835b))
* finish removing docs/PLAN.md and docs/UX-SPEC.md references from source ([e63d064](https://github.com/JoveWorks/joveworks/commit/e63d064d48a2f2e1d6c238436db3970ae62cc143))
* position JoveWorks as a foundation for Jupyter ([1df4643](https://github.com/JoveWorks/joveworks/commit/1df4643e948d0cf428d71adbb691ce8cf4da7a48))
* prune the roadmap to what is actually open ([0a9c0a4](https://github.com/JoveWorks/joveworks/commit/0a9c0a407b5ff1a7125a30d01f296df554a19fd4))
* record 2026-08-28 and hand over the extractor drift ([3a5e39b](https://github.com/JoveWorks/joveworks/commit/3a5e39b2c03d541bce9456e7c8639902fe8578b7))
* record the list/spectrum collapse as ROADMAP item 58 ([526c16a](https://github.com/JoveWorks/joveworks/commit/526c16acd46038ce06853d7a896c363b62b0334a))
* rewrite item 58 to delete the spectrum concept outright ([f349c13](https://github.com/JoveWorks/joveworks/commit/f349c13fc475a227b796b05bfc92f4195acd2393))
* true up the records that outran reality ([e284bbf](https://github.com/JoveWorks/joveworks/commit/e284bbf44ceb161937917f50102410c4cf921bdc))
* update GitHub owner references to JoveWorks/joveworks ([7252990](https://github.com/JoveWorks/joveworks/commit/7252990b433ad8e356ba4876e981ce53726cc94f))
## [0.21.0](https://github.com/JoveWorks/joveworks/compare/v0.20.0...v0.21.0) (2026-08-27)

### Features

* **editor:** add an advanced-nodes editor preference ([a8d4b9e](https://github.com/JoveWorks/joveworks/commit/a8d4b9e5d31539a2cce0df9370b9a3e419526412))
* **editor:** configurable base path and a visible release channel ([c512580](https://github.com/JoveWorks/joveworks/commit/c5125805c5b5092bce781bb74ae401ca943fcaf9))
* **editor:** discover Hub courses ([1dd1d10](https://github.com/JoveWorks/joveworks/commit/1dd1d100fd5443968d8fedcdc2294ed01b2146ec))
* **editor:** gate advanced palette entries behind the preference ([4c6e5cd](https://github.com/JoveWorks/joveworks/commit/4c6e5cd15ed6bd71a1ab59db3f91de93526e0dce))
* **editor:** resolve inline Hub catalogue contents with integrity checks ([8e58616](https://github.com/JoveWorks/joveworks/commit/8e58616b41cb1b555fac2bd639bc7a5a2dadfe21))
* **editor:** use inline catalogue contents when opening course material ([9da70e6](https://github.com/JoveWorks/joveworks/commit/9da70e6097844a5769fadb08ecf09c8b40b30e1e))
* **schema:** add an explicit document-migration entry point ([568365e](https://github.com/JoveWorks/joveworks/commit/568365e42ef126b78baec66f6ee5d22163a01ae6))

### Fixes

* **editor:** harden the NodeBook's print/PDF export ([e40b66f](https://github.com/JoveWorks/joveworks/commit/e40b66f4d2d37e738787fc11eec398b1e9947e84)), references [#46](https://github.com/JoveWorks/joveworks/issues/46)
* **editor:** persist Hub address ([4dd66b0](https://github.com/JoveWorks/joveworks/commit/4dd66b05c036cf5e41eef44dc657b4cfda15876b))
* **editor:** ship the stable bundle with a relative base, not an absolute one ([756c52d](https://github.com/JoveWorks/joveworks/commit/756c52da1c48b2c8ff0ebf4e66ea4b6537629d32))
* **editor:** size the Feasibility heatmap's single-panel width from its own ticks ([fe58bcc](https://github.com/JoveWorks/joveworks/commit/fe58bccf6a8fd65266a239358c7ffcedc6547bee))
* **editor:** update the print-expressions test for the merged schema split ([614e81e](https://github.com/JoveWorks/joveworks/commit/614e81e682e4176f15a88be581bd77ca6dc1ef2b))
* verify inline Hub catalogue hashes ([f26a809](https://github.com/JoveWorks/joveworks/commit/f26a809190c76d9064ee763406b865c44c5f883d))

### Refactoring

* **schema:** split SCHEMA_VERSION into per-artefact stamps ([231f4bb](https://github.com/JoveWorks/joveworks/commit/231f4bba370eed8a0d14fbaea373a91e9aa46545))
* **schema:** update SCHEMA_VERSION call sites for the per-artefact split ([7fb6828](https://github.com/JoveWorks/joveworks/commit/7fb6828e87fc3d821d8cd45b452d752ad246900f))
* **schema:** wire document/catalogue parsers to their own version stamp ([6b52542](https://github.com/JoveWorks/joveworks/commit/6b52542ac923b5d6ea3fc2ad4f73dd221029fd4d))

### Documentation

* record beta status and the next session's priorities ([b84b6a0](https://github.com/JoveWorks/joveworks/commit/b84b6a01df6a7433968db1a1331fde60fc183878))
* record the document-migration mechanism in ROADMAP item 17 ([af3e93c](https://github.com/JoveWorks/joveworks/commit/af3e93c27d608e6b91a85aeb170fcda3646f6f0d))
* record the schema version split and the catalogue migration gap ([c8fe0b4](https://github.com/JoveWorks/joveworks/commit/c8fe0b4e360cf060ce6bcced04e91e9df9b1bd1f))
## [0.20.0](https://github.com/JoveWorks/joveworks/compare/v0.19.1...v0.20.0) (2026-08-27)

### Features

* **editor:** manage Hub workspaces ([8758961](https://github.com/JoveWorks/joveworks/commit/875896105c84e85ad14cd02ef3ed3d048d69035a))
* **editor:** open linked course publications ([9b3dffd](https://github.com/JoveWorks/joveworks/commit/9b3dffdb590603538ad5b74c1acb417b5f164163))
* **editor:** open linked Hub workspaces ([e8f7b4b](https://github.com/JoveWorks/joveworks/commit/e8f7b4beef337d4e859f01e07961e6345d78a379))
* **editor:** restore course-pinned workspaces ([e1dff62](https://github.com/JoveWorks/joveworks/commit/e1dff62e971552b840e5aed4e34f6694a92a11f9))
* **editor:** save workspaces to Hub ([2093594](https://github.com/JoveWorks/joveworks/commit/20935944f3f085a5941c9191a5a1fa7074e7da6c))
* **editor:** share student workspaces ([aa890cc](https://github.com/JoveWorks/joveworks/commit/aa890cc5a86d4d25a69d281ffd1e726f37cdf354))

### Fixes

* **editor:** restore contour colorbar thresholds ([e11db3e](https://github.com/JoveWorks/joveworks/commit/e11db3e35a08c24df81506321ff9863a56da45ab))
* **editor:** use Hub student share URL ([0a3abb6](https://github.com/JoveWorks/joveworks/commit/0a3abb669617cf0502b046c7e9e7be11d39ea5f8))
* **schema:** allow zero table figures ([43585ce](https://github.com/JoveWorks/joveworks/commit/43585ceeb29d6092791cf6d3aba3c6ca337d254d))
## [0.19.1](https://github.com/JoveWorks/joveworks/compare/v0.19.0...v0.19.1) (2026-08-27)

### Features

* add intelligent multi-role plots ([96204f4](https://github.com/JoveWorks/joveworks/commit/96204f40e21de769cc2be846ea6ce71b5a4ff090))
* **editor:** connect course material from Hub ([a57cad7](https://github.com/JoveWorks/joveworks/commit/a57cad785f819a1df6eb07592199fa78b1dee5bd))

### Fixes

* **editor:** polish nested group interactions ([4c74d99](https://github.com/JoveWorks/joveworks/commit/4c74d99f807a581635bca0670bc1779851a3a427))
* **editor:** render intelligent contour grids ([2099c7f](https://github.com/JoveWorks/joveworks/commit/2099c7fd428dba61933b416ab62df5b65edfa7c7))
## [0.19.0](https://github.com/JoveWorks/joveworks/compare/v0.18.0...v0.19.0) (2026-08-26)

### Features

* add assumption stress analysis ([e51618c](https://github.com/JoveWorks/joveworks/commit/e51618c2b39d205fe7daa66bf7fc7abdbaa41ad3))
* **editor:** add nested group frames ([b600314](https://github.com/JoveWorks/joveworks/commit/b60031437d39778b6be603663372952336849d84))
* **editor:** add running catalogue example ([77e3028](https://github.com/JoveWorks/joveworks/commit/77e3028edeb6a94fc0e9fa536d57593dc0e459af))
* **editor:** collapse groups into macro nodes ([bb53c37](https://github.com/JoveWorks/joveworks/commit/bb53c379ed6cd91282842bfe8273211ba0529189))
* **schema:** support YAML catalogues ([e622eed](https://github.com/JoveWorks/joveworks/commit/e622eedb515a17015c5de537fcbd7a953510890d))

### Fixes

* **editor:** carry nested groups with parent drags ([0ac400f](https://github.com/JoveWorks/joveworks/commit/0ac400fc32452e6bbd1b8154d90b873ac411f8b1))
* **editor:** keep parent group controls reachable ([6519942](https://github.com/JoveWorks/joveworks/commit/65199421219df1f1369e5ea4d6a225eb82fab3f0))
## [0.18.0](https://github.com/JoveWorks/joveworks/compare/v0.17.0...v0.18.0) (2026-08-25)

### Features

* add a range node whose bounds and count can be wired ([32905d7](https://github.com/JoveWorks/joveworks/commit/32905d7c358106cb4774e71bc4f53482d94fa989))
* **catalogues:** add Canon EOS R7, EF-S 18-55mm and Tamron 18-270mm ([408145d](https://github.com/JoveWorks/joveworks/commit/408145d7e44fc76c08a76abd3ee7f07d684f8332))
* **editor:** add wildlife camera comparison example ([fe7bef9](https://github.com/JoveWorks/joveworks/commit/fe7bef9e652ca42e686236934df8fb1c4376dc1f))
* **editor:** surface a port's obvious producer at the top of Quick Add ([93c518c](https://github.com/JoveWorks/joveworks/commit/93c518cfbc0c61e32ad7710c5684d171e345ca0d))

### Fixes

* **editor:** draw a published NodeBook's marks in the read-only viewer ([d99dcb9](https://github.com/JoveWorks/joveworks/commit/d99dcb93e00e9eb2bcf3452513f891a1e1d49c6a))
* **editor:** duplicating a node reconnects its incoming wires ([4f0e285](https://github.com/JoveWorks/joveworks/commit/4f0e2857f2c5eabeccc0e2974b38d14e856374e8))
* **editor:** hide wildlife example from help menu ([6d12922](https://github.com/JoveWorks/joveworks/commit/6d12922760d04a24142ba26cad5058ccff8ccb4d))
* **editor:** place pastes and show wired values ([296b324](https://github.com/JoveWorks/joveworks/commit/296b3244f224276e1a46b2d3b8092ba69aaadfaa))
* **editor:** round slider values by decimal places ([76b45b5](https://github.com/JoveWorks/joveworks/commit/76b45b57c0d0f5b9214c9e0c96c1415096a4776e))
## [0.17.0](https://github.com/JoveWorks/joveworks/compare/v0.16.0...v0.17.0) (2026-08-25)

### Features

* Pareto output and document-wide candidate marking ([fb684c1](https://github.com/JoveWorks/joveworks/commit/fb684c183e936348bc374ef9d8876bf5d91f6df9))
* show NodeBook controls once per section ([2b5ae17](https://github.com/JoveWorks/joveworks/commit/2b5ae177ecf91bc09db4e04066930d079c34f194))

### Fixes

* **editor:** a contour's threshold is an isoline, and a plot can be clicked ([41d716c](https://github.com/JoveWorks/joveworks/commit/41d716cf6f42c008607bec00864136ea326660b0))
* place contour marks on the second swept axis, and document marking ([84c6775](https://github.com/JoveWorks/joveworks/commit/84c67754a16dd298dc2690daa8ad998f3c4351fc))
## [0.16.0](https://github.com/JoveWorks/joveworks/compare/v0.15.0...v0.16.0) (2026-08-24)

### Features

* add Monte Carlo reliability reports ([9a587b7](https://github.com/JoveWorks/joveworks/commit/9a587b72401da0c5703a18b8e1cb7b5cd2421409))
* expose interactive inputs in NodeBooks ([454d8ad](https://github.com/JoveWorks/joveworks/commit/454d8ad3015dcae28ef4692bcf8492f9b5e8a566))
* merge reliability reports ([80bb079](https://github.com/JoveWorks/joveworks/commit/80bb079b11734b96edef67869753ca5b257ce117))

### Documentation

* Roadmap items. ([91e3233](https://github.com/JoveWorks/joveworks/commit/91e3233f5052f738a90a1f71a4fe9ff5fa3460c1))
## [0.15.0](https://github.com/JoveWorks/joveworks/compare/v0.14.0...v0.15.0) (2026-08-24)

### Features

* **editor:** add aperture decision example ([00ff34a](https://github.com/JoveWorks/joveworks/commit/00ff34abccb9c560082965999ae181d88d3f373f))
* selection nodes and the Best Design card ([b86799f](https://github.com/JoveWorks/joveworks/commit/b86799f7a3439b116f3c07d9271256c7c80491c2))

### Fixes

* **editor:** stop a first visit autosaving a document nobody touched ([bd62d85](https://github.com/JoveWorks/joveworks/commit/bd62d854168d1e49e29b0ffdd64f60258bf7b8ca))

### Documentation

* feature planning ([33b56d0](https://github.com/JoveWorks/joveworks/commit/33b56d0de6cc4b64199adfeb0517fd66a34f75cc))
* plan selection nodes and the Best Design card ([28b8db8](https://github.com/JoveWorks/joveworks/commit/28b8db80975ccfd7d45cd7a069dc8c7e4a4c0dc0))
## [0.14.0](https://github.com/JoveWorks/joveworks/compare/v0.13.1...v0.14.0) (2026-08-24)

### Features

* type a value on any input port ([a8aa5da](https://github.com/JoveWorks/joveworks/commit/a8aa5da219e0fdb029c30604d2650b5c24e41179))

### Fixes

* **editor:** draw a contour plot as a line when its second axis goes away ([7dc1174](https://github.com/JoveWorks/joveworks/commit/7dc1174fc4e6b25fe1c77e01f12c991fcf05551c))
* **editor:** re-center node detail equations ([7d13c8b](https://github.com/JoveWorks/joveworks/commit/7d13c8b5480941dcdfda520c0d0616977a40b2f3))
* **editor:** stop a feasibility figure crashing on an axis nothing varies along ([4655a3d](https://github.com/JoveWorks/joveworks/commit/4655a3d711f7940adb66c95338b46f6dc711775a))
* **editor:** stop clipping multi-output node values ([6bddef8](https://github.com/JoveWorks/joveworks/commit/6bddef87d8e8918f0c1678046dbd542d0c5e3a09))

### Refactoring

* centralize node kind and quick-add defaults ([f3d9200](https://github.com/JoveWorks/joveworks/commit/f3d9200120952e500eb8bf5d2c25eaaf3f880ff3))
* **editor:** centralize table column connections ([4dee434](https://github.com/JoveWorks/joveworks/commit/4dee4342a1d912e8e13be96823d9ba0520f82bda))

### Documentation

* add feature review ([3e44379](https://github.com/JoveWorks/joveworks/commit/3e44379c0710d8521961307ecc5fb9466e9309f2))
## [0.13.1](https://github.com/JoveWorks/joveworks/compare/v0.13.0...v0.13.1) (2026-08-24)

### Features

* **editor:** read the focus distance a photograph was taken at ([338e57f](https://github.com/JoveWorks/joveworks/commit/338e57f9505946ef24aaf57aa081e5a937faf8b2))
* **schema:** let one formula answer with several expressions, merge the depth-of-field nodes ([8761b7d](https://github.com/JoveWorks/joveworks/commit/8761b7dca1d199414f5785cbc6eafc454efbaae5))
## [0.13.0](https://github.com/JoveWorks/joveworks/compare/v0.12.2...v0.13.0) (2026-08-24)

### Features

* **photography:** show circle of confusion in µm, add pixel-based variant ([8aaf6d6](https://github.com/JoveWorks/joveworks/commit/8aaf6d669e82f88f84c646cf6bf3b05893fedb1a))
* read a photograph's own settings into the graph ([06a0dad](https://github.com/JoveWorks/joveworks/commit/06a0daddd8df1906f00f3d5fbe66048cb790400c))
* **schema:** let a formula answer with several outputs, add camera and lens libraries ([c3f0362](https://github.com/JoveWorks/joveworks/commit/c3f0362d8efdc45bc211549a96ed6eab47db629e))

### Fixes

* **editor:** condense a node that answers with several properties ([05c21ed](https://github.com/JoveWorks/joveworks/commit/05c21ed5a5f3d8dbc6a7ff7053ff74c3b5e7b5c4))
* **editor:** give every output port hover text of its own ([f9fb167](https://github.com/JoveWorks/joveworks/commit/f9fb167fec0c2762d9bdcad9ee9f62f5af472d25))
* **nodes:** let categorical values flow through pack/unpack/waypoint, split waypoint's shared handle ([f38f458](https://github.com/JoveWorks/joveworks/commit/f38f4588c2f7a9afd95a81ec9922b11cf5660ca8))

### Documentation

* add full-project review inventory ([c04998d](https://github.com/JoveWorks/joveworks/commit/c04998d2993b2dde81c325f6f25d86f9dba6d77e))
* drop two roadmap items the work has caught up with ([694914d](https://github.com/JoveWorks/joveworks/commit/694914d139d818295779d38d6470bc5ff80a9061))
* record the file node and what is still open behind it ([45fab85](https://github.com/JoveWorks/joveworks/commit/45fab857c592b69db9a4016b5fa3e911686b07ff))
## [0.12.2](https://github.com/JoveWorks/joveworks/compare/v0.12.1...v0.12.2) (2026-08-23)

### Fixes

* **canvas:** restore scroll-to-zoom ([12b3e4b](https://github.com/JoveWorks/joveworks/commit/12b3e4b40d3b21846e797e7161d9003e0d083bc0))

### Refactoring

* **editor:** trim palette node copy, rename equation to custom expression ([bc83016](https://github.com/JoveWorks/joveworks/commit/bc83016d3899817ec2f71ceea23569eaf07e80f6))

### Documentation

* add editor screenshot, drop KU Leuven references ([ca5a684](https://github.com/JoveWorks/joveworks/commit/ca5a68447bfd30b5a5b531f674dcebbf1c95be9d))
* **docs-site:** add editor tips-and-tricks guide page ([401c4dc](https://github.com/JoveWorks/joveworks/commit/401c4dc8659865164a378b3f5d362e033cf77541))
* **docs-site:** fill gaps in getting-started, sweeps, and units guides ([39e7fb4](https://github.com/JoveWorks/joveworks/commit/39e7fb4fcdc176974edc6023c9edff5ae269ec36))
* **node-reference:** expand and restructure by palette section, link output nodes to their own paragraph ([a3475c1](https://github.com/JoveWorks/joveworks/commit/a3475c1bba5b25880140b8acaeb4cd03c3f550f7))
## [0.12.1](https://github.com/JoveWorks/joveworks/compare/v0.12.0...v0.12.1) (2026-08-23)

### Features

* add catalogue-authoring companion app ([20039a4](https://github.com/JoveWorks/joveworks/commit/20039a4e22169f452e1d0e7e61f4972edfee8411)), references [#32](https://github.com/JoveWorks/joveworks/issues/32)
* **editor:** save the document with Ctrl+S/Cmd+S ([a240446](https://github.com/JoveWorks/joveworks/commit/a24044630ea5e1483ae34d2bbbb0cdda31e5bc9c))
* **editor:** spectrum values are creatable and editable ([a4c8bce](https://github.com/JoveWorks/joveworks/commit/a4c8bce7f0e3f9e2c2b56b085da9f5cccc17ccb9))
* **kernel,schema,nodes:** piecewise formula evaluator + shaft torque diagram ([2e81f85](https://github.com/JoveWorks/joveworks/commit/2e81f85835457f0126b7f037ec571560de46d606))
* **kernel,schema,nodes:** shaft deflection (beam displacement) ([87b496a](https://github.com/JoveWorks/joveworks/commit/87b496ae8add9460b174e3f96e095679a6382400))
* **kernel,schema,nodes:** shaftDeflection convenience formula ([df778d2](https://github.com/JoveWorks/joveworks/commit/df778d2cf6c782a03020c92cc36fafbd80a48261))
* **kernel,schema,nodes:** shear/moment diagrams and reaction solve ([4ef37f4](https://github.com/JoveWorks/joveworks/commit/4ef37f4204f8a967b1418bf3ab2ebc85bd691e83))
* **kernel,schema,nodes:** uniform distributed loads ([aa90b4f](https://github.com/JoveWorks/joveworks/commit/aa90b4f122e38ca430f35fc8e8f6e21e9e70065d))
* **nodes:** add double/half arithmetic nodes ([4c2e319](https://github.com/JoveWorks/joveworks/commit/4c2e3190f5966945e8caf6758a6c9dc631b4cec3))

### Fixes

* **canvas:** align/space use each node's resting size, and offer selection actions from anywhere on the pane ([a283345](https://github.com/JoveWorks/joveworks/commit/a283345af6b6c41389dc1fd704d8f4a84f5dc248))
* **canvas:** Enter finalizes a multiline field instead of adding a newline ([bd51f23](https://github.com/JoveWorks/joveworks/commit/bd51f23845552a07e637309f28c5c96123f1e6d6))
* **canvas:** keep marquee hit-testing stable against hover/selection-driven node opening ([43a3423](https://github.com/JoveWorks/joveworks/commit/43a342379928a2ac9b930ea7c0c277ed13f7fa93))
* **canvas:** keep the right-click menu on screen near viewport edges ([c3e85c4](https://github.com/JoveWorks/joveworks/commit/c3e85c48fb26e75e15719dcebda81aab3b2e669d))
* **editor:** don't auto-start the tutorial on a mobile-width viewport ([e189ced](https://github.com/JoveWorks/joveworks/commit/e189cedf4c3bd482a504fa8c2118b52e17913832))
* **editor:** highlight quick-add's top match and align it with Enter ([ece2603](https://github.com/JoveWorks/joveworks/commit/ece2603ee2a2c9c134b49eaf549ffd7edc551542))
* **editor:** show formula equations for R&M nodes and in quick-add ([9104720](https://github.com/JoveWorks/joveworks/commit/910472058bfcd7e62380c2670b7a4a9f5d2e8481))

### Documentation

* Roadmap ([08ab8e4](https://github.com/JoveWorks/joveworks/commit/08ab8e4149e1ad7782d119c2bb0b33948ebbfa2c))
* update ROADMAP for deflection ([4fc3bb8](https://github.com/JoveWorks/joveworks/commit/4fc3bb8960af9aa764a891569b153bb768adde0f))
* update ROADMAP for the shaft-diagrams slice ([7a33b47](https://github.com/JoveWorks/joveworks/commit/7a33b47046dc7a639d2a37135b678e1830ad7503))
## [0.12.0](https://github.com/JoveWorks/joveworks/compare/v0.11.0...v0.12.0) (2026-08-22)

### Features

* **editor:** show tooltips on table/plot input ports from upstream formula ([99b94c3](https://github.com/JoveWorks/joveworks/commit/99b94c37c4fc327b9b32e8e03730f1ca9260c545))

### Fixes

* **editor:** hover over formula/closure/compare output row highlights connected nodes ([757c4cd](https://github.com/JoveWorks/joveworks/commit/757c4cd1299d6e82269a7464ba9c911cf2ce6e36))
* **editor:** hover over input/generator output value now highlights connected nodes ([ab29451](https://github.com/JoveWorks/joveworks/commit/ab294516f7fe9d1f7f909d546aa610988951dbb3))
* **editor:** label a contour plot's y axis with its own axis, not the colorbar ([d9a1aa1](https://github.com/JoveWorks/joveworks/commit/d9a1aa160f258472e2f36f496eeec1fa66bb1ff9))
* **editor:** let closure/equation node output unit be picked ([cf8260e](https://github.com/JoveWorks/joveworks/commit/cf8260eedb7a4a38f41ef7bb222cbd7be511a97c))
* **release:** push to origin before dispatching release workflow ([7235596](https://github.com/JoveWorks/joveworks/commit/7235596d50bf1203faeb9247cb903783ed55c8c3))

### Documentation

* Roadmap ([e1b945b](https://github.com/JoveWorks/joveworks/commit/e1b945ba50b2689f2ce3e13f03afb936ece9aa4a))
## [0.11.0](https://github.com/JoveWorks/joveworks/compare/v0.10.0...v0.11.0) (2026-08-22)
## [0.10.0](https://github.com/JoveWorks/joveworks/compare/v0.9.2...v0.10.0) (2026-08-22)

### Features

* **editor:** drive the Monte Carlo clearance example from an ISO fit ([11961da](https://github.com/JoveWorks/joveworks/commit/11961da22fe9f6b55548323cc0cb3ecc63ff8e01))
* **editor:** hover a Feasibility cell for coordinates and which check failed ([0eb58e9](https://github.com/JoveWorks/joveworks/commit/0eb58e960636bbea09ab876cec44b56a9a07f207))
* **editor:** show output-port tooltips, fill in photography catalogue ([ccad1fe](https://github.com/JoveWorks/joveworks/commit/ccad1fe858e7caf1bfe03efec6166c1c023b63de))
* **kernel:** make Monte Carlo generator parameters wireable ([6c1d430](https://github.com/JoveWorks/joveworks/commit/6c1d430c238da2b6cccdd9320cc9d3325eb3da7c))
* **nodes:** add array reduction nodes — count, mean, median, sdev, valueAt ([0f38fdd](https://github.com/JoveWorks/joveworks/commit/0f38fdd16e53be82d04a1eecc8f30e76691075d8))
* **nodes:** split spectrum reductions into their own Array nodes catalogue ([3eb8e2d](https://github.com/JoveWorks/joveworks/commit/3eb8e2d654ee18da4298892510ea4d6a236b9574))

### Fixes

* **editor:** freeze the canvas during the tutorial to stop a crash ([bc0365e](https://github.com/JoveWorks/joveworks/commit/bc0365eedf0f0a0681744e97da50f50163cd65db))
* **editor:** resolve chartTip's box color for real instead of trusting Plot.tip's var() ([34f1e5a](https://github.com/JoveWorks/joveworks/commit/34f1e5a2f1a5a87f46670a8099ac6a0fab480cdf))
* **kernel:** make at(xs, i) 0-based, not 1-based ([bb410d1](https://github.com/JoveWorks/joveworks/commit/bb410d18e76d179825e26f862a01c4795f45aec9))

### Performance

* **kernel:** let evaluateDocument skip nodes seeded from a prior run ([419953c](https://github.com/JoveWorks/joveworks/commit/419953c90c2b5be53b70afcce5097db1e4791033))
* **schema:** memoize formulaHash per formula object ([ae1a777](https://github.com/JoveWorks/joveworks/commit/ae1a777d3fdb039824b1f0b2f43180b9e2f152d5))

### Documentation

* **roadmap:** add Feasibility heatmap and marquee-selection backlog items ([d378020](https://github.com/JoveWorks/joveworks/commit/d378020cefd1c8d8ab886c2440bcae871e7cead7))
## [0.9.2](https://github.com/JoveWorks/joveworks/compare/v0.9.1...v0.9.2) (2026-08-21)

### Features

* **catalogue:** add public Photography formula catalogue ([76e1b42](https://github.com/JoveWorks/joveworks/commit/76e1b42af39c9d38ce01e11fbcb1281eec6b8b1d))
* **editor:** add depth-of-field example from the Photography catalogue ([a9c6206](https://github.com/JoveWorks/joveworks/commit/a9c6206c8bac2129d300ee7a2fdf057e98ed73dc))
* **editor:** highlight a Feasibility node's referenced Checks on hover ([7760b86](https://github.com/JoveWorks/joveworks/commit/7760b86f76e5339e70f39c210d4bd62494285872))
* **editor:** render formula node equations on expand too ([04efea5](https://github.com/JoveWorks/joveworks/commit/04efea59221e351617e8e05d4ca56c0692dde0e2))
* **editor:** render the equation node's expression as LaTeX when expanded ([beb1bd7](https://github.com/JoveWorks/joveworks/commit/beb1bd7eabd28b933e5e480dad33bf4eeb263aec))
* **editor:** select full value on focus for numeric fields ([60e677f](https://github.com/JoveWorks/joveworks/commit/60e677f0a188713481dd62da4ac1c2379537b22d))
* Feasibility and Sensitivity analysis output nodes ([f3afb45](https://github.com/JoveWorks/joveworks/commit/f3afb45bb2472d2dec572e969ff9ea6c12f89ed3))
* password-shared restricted catalogues (roadmap [#28](https://github.com/JoveWorks/joveworks/issues/28)) ([16e8582](https://github.com/JoveWorks/joveworks/commit/16e8582fe14a94966e95b31da56377bceda941a1))

### Fixes

* **editor:** checkbox claiming the row, and KaTeX skipping the legend wrapper ([564a773](https://github.com/JoveWorks/joveworks/commit/564a773a62af20b62f7d9779a14818293f8209c9))
* **editor:** checklist alignment, KaTeX axis labels, doc pass for Analysis nodes ([752bd8f](https://github.com/JoveWorks/joveworks/commit/752bd8f780f0bd23e4c6215e7fb362738ccd755f))
* **editor:** defer Feasibility readiness to a second pass — same ordering bug as the kernel ([83c1f3e](https://github.com/JoveWorks/joveworks/commit/83c1f3e21b0d6ffd3a43876c021d0b219ddc171c))
* **editor:** disabled context-menu items looked identical to enabled ones ([275c9f0](https://github.com/JoveWorks/joveworks/commit/275c9f09bb06e094e1ab44134b7a9c7d3cbbcdcc))
* **editor:** roadmap items 38-41 — Pa units, check mark position, table decimals, quick-add speed ([713422f](https://github.com/JoveWorks/joveworks/commit/713422f194803d95668fcdb2949a205a670accf0)), references [#38](https://github.com/JoveWorks/joveworks/issues/38) [#39](https://github.com/JoveWorks/joveworks/issues/39) [#40](https://github.com/JoveWorks/joveworks/issues/40) [#41](https://github.com/JoveWorks/joveworks/issues/41) [#42](https://github.com/JoveWorks/joveworks/issues/42)
* **editor:** size a Feasibility facet panel to fit its own x-axis ticks ([897e2f6](https://github.com/JoveWorks/joveworks/commit/897e2f60b6e04fe2b723335f6f3bf071b52669e0))
* **editor:** track locked-catalogue unlock state by its own id ([ca1d3ee](https://github.com/JoveWorks/joveworks/commit/ca1d3ee51f1f7c0d3779092b2103fe46d8e4145d))

### Documentation

* Add analysis node plan ([80ea818](https://github.com/JoveWorks/joveworks/commit/80ea8187aafc91b4673ca0d298b40e5538dc61cb))
* add repo file guide ([16aeea2](https://github.com/JoveWorks/joveworks/commit/16aeea22fc5206cbdc912ff1807043040d335879))
* roadmap items ([67c46c3](https://github.com/JoveWorks/joveworks/commit/67c46c386acd9273ef02d46449b89ee4a00e7a43))
## [0.9.1](https://github.com/JoveWorks/joveworks/compare/v0.9.0...v0.9.1) (2026-08-21)

### Features

* **editor:** colour a check's sweep by where it starts failing ([04642df](https://github.com/JoveWorks/joveworks/commit/04642df822c2dc8f747c94960cfa13c2325f05ff))
* **editor:** Monte Carlo nodes in Quick Add, shared playback, linked sample limit ([841fba3](https://github.com/JoveWorks/joveworks/commit/841fba3e149492abbe7ec15e5e60fcfe9f318f0a)), references [#27](https://github.com/JoveWorks/joveworks/issues/27) [#31](https://github.com/JoveWorks/joveworks/issues/31)
* **editor:** move table settings into the notebook, fix reorder edge mismatch ([f6948e2](https://github.com/JoveWorks/joveworks/commit/f6948e2c0fdaa2589a8996a9ff4674f18fb67dc5)), references [#1](https://github.com/JoveWorks/joveworks/issues/1)
* let Monte Carlo generators combine without gridding (ROADMAP.md [#31](https://github.com/JoveWorks/joveworks/issues/31)) ([223243a](https://github.com/JoveWorks/joveworks/commit/223243a233a62da4734a0d229befd3838134b812))

### Fixes

* batch of small editor and unit-parsing roadmap fixes ([eefa2c9](https://github.com/JoveWorks/joveworks/commit/eefa2c938170b4096a94cb51b59a3cc1ba06e0c2))
* **editor:** check threshold on the node sparkline, and a title-clipping bug ([cb21fce](https://github.com/JoveWorks/joveworks/commit/cb21fce5875c9e19bb374b8b31e85f454adc28d7))
* **editor:** colour mixed check segments and split two-crossing sweeps ([3823d29](https://github.com/JoveWorks/joveworks/commit/3823d297a458d76a36f6bfd855fb094d8f51bf3b))
* **editor:** three-state check verdict, and notebook layout polish ([950cdac](https://github.com/JoveWorks/joveworks/commit/950cdac10516c9c8984962faa9eea9c93a491f28))

### Documentation

* add plan for password-shared catalogues (roadmap [#28](https://github.com/JoveWorks/joveworks/issues/28)) ([4f73aa8](https://github.com/JoveWorks/joveworks/commit/4f73aa8f20d7a3529ce08efe92fae3e0df26cf65))
* Add roadmap items ([27dffad](https://github.com/JoveWorks/joveworks/commit/27dffad5095dad63ca82f67a42fa6a0da4f456fc))
* Add roadmap items ([1da2478](https://github.com/JoveWorks/joveworks/commit/1da247871f5da73bd172d016fa0740c8515bbcd5))
* Add roadmap items ([82e968c](https://github.com/JoveWorks/joveworks/commit/82e968c9962379d0c11b016b25d7592b16ee208d))
* Cleanup old docs ([fbcfe72](https://github.com/JoveWorks/joveworks/commit/fbcfe72f51b2f0648d36ed2e66e99e4b8cca80db))
* Roadmap items. ([ab69258](https://github.com/JoveWorks/joveworks/commit/ab692587743627b679f1b419648d4b448aebc920))
* update roadmap ([c7c2a1d](https://github.com/JoveWorks/joveworks/commit/c7c2a1d67fa19ad69e5262611f6bf309a92eaf65))
* update roadmap ([7d6f061](https://github.com/JoveWorks/joveworks/commit/7d6f06104a9ca237671126146189c00a425772e1))
* update roadmap ([3518044](https://github.com/JoveWorks/joveworks/commit/3518044341d6af8804cd8d358c0a69101caaf7dc))
## [0.9.0](https://github.com/JoveWorks/joveworks/compare/v0.8.0...v0.9.0) (2026-08-18)

### Features

* add Monte Carlo node catalogue ([#27](https://github.com/JoveWorks/joveworks/issues/27)) ([5c89fb8](https://github.com/JoveWorks/joveworks/commit/5c89fb89fefd6945cab2a31ca83e20c21bb12ad1))
* **editor:** add canvas fuzzy find ([091d77f](https://github.com/JoveWorks/joveworks/commit/091d77fd4fe3122dc6694d81cf03f36f8872a92a))
* **editor:** highlight ports from edge hovers ([7e26681](https://github.com/JoveWorks/joveworks/commit/7e266814242d2eb72dd34be0a6ccf281fe3f1b38))

### Fixes

* **editor:** align the canvas grid with node bounds ([63fd28b](https://github.com/JoveWorks/joveworks/commit/63fd28b2952238c616fe88882e2bf643c7c4dec6))
* **editor:** center Monte Carlo playback controls and size the notebook histogram ([cc0adbb](https://github.com/JoveWorks/joveworks/commit/cc0adbbea55c4da48086bf916651e2be493c7d54))
* **editor:** consolidate edge-hover highlight styling ([cea7f6e](https://github.com/JoveWorks/joveworks/commit/cea7f6ebd94d5ada0f93a686781b4c52c6424617))
* **editor:** grid-snap frame resize, fix catalogue grouping, restore print width ([e6fa2e2](https://github.com/JoveWorks/joveworks/commit/e6fa2e2143a65bdf9c5a5f94e20f080ea95217c6))
* **editor:** highlight Monte Carlo nodes/ports on edge hover ([491a990](https://github.com/JoveWorks/joveworks/commit/491a9902f873867f0aff551eb10f776e9bf00e8d))
* **editor:** stop dragging through text fields ([677d2f2](https://github.com/JoveWorks/joveworks/commit/677d2f24b8f591b4e51e11fa888b859e27e065ea))
* **editor:** stop the Monte Carlo mean label distorting at fluid width ([91bf838](https://github.com/JoveWorks/joveworks/commit/91bf838d90e054f125584cd1ca0636082a036b05))
* **editor:** tighten Monte Carlo layout and playback control legibility ([ac2961e](https://github.com/JoveWorks/joveworks/commit/ac2961e71d89de646bdc4e3eb205c7c92b5fa50e))
* **editor:** use measured node sizes in auto-arrange ([1aba4d4](https://github.com/JoveWorks/joveworks/commit/1aba4d4c91cc60e4c9f04326aa5375c3cf65d7d0))
* **editor:** wrap node and notebook titles ([ed53801](https://github.com/JoveWorks/joveworks/commit/ed53801e6e564a77a855265ba5b969b146ea8d51))
* **nodes:** rename built-in nodes to base nodes ([394a8bf](https://github.com/JoveWorks/joveworks/commit/394a8bf17757fd895445000cbff3af8614f37a32))

### Documentation

* mark roadmap group C items as implemented ([5d1aedc](https://github.com/JoveWorks/joveworks/commit/5d1aedcb813f9317ffb2506d0a3f7ba5516b99a4)), references [#10](https://github.com/JoveWorks/joveworks/issues/10) [#14](https://github.com/JoveWorks/joveworks/issues/14) [#15](https://github.com/JoveWorks/joveworks/issues/15) [#18](https://github.com/JoveWorks/joveworks/issues/18) [#19](https://github.com/JoveWorks/joveworks/issues/19) [#26](https://github.com/JoveWorks/joveworks/issues/26) [#28](https://github.com/JoveWorks/joveworks/issues/28)
* number backlog, add session groupings, and clarify no-CAS stance ([f073b46](https://github.com/JoveWorks/joveworks/commit/f073b46182a5bc0fa0f376707a4f492ad96b3c92))
* resolve Monte Carlo catalogue open questions ([#27](https://github.com/JoveWorks/joveworks/issues/27)) ([f6daeff](https://github.com/JoveWorks/joveworks/commit/f6daeffef45daad3dcb9cbb694a7638fa8c9c006))
* Roadmap items. ([8858628](https://github.com/JoveWorks/joveworks/commit/885862869c529ce2913f45a290f238db3b129378))
* Roadmap items. ([5220621](https://github.com/JoveWorks/joveworks/commit/5220621d6cbebdda11add7c6d59a3bd1a634d7ec))
* **roadmap:** trim landed items, add review feedback notes ([501b0fa](https://github.com/JoveWorks/joveworks/commit/501b0faa281be23ca305a8a687517df90f42ffa3))
* update roadmap ([e8edb3b](https://github.com/JoveWorks/joveworks/commit/e8edb3b19922f3e03797f0b2a9268adb140351eb))
* update roadmap ([5e237d4](https://github.com/JoveWorks/joveworks/commit/5e237d4bf3cdea9332f090a7b3f6b733bbcd3526))
* update roadmap ([1545057](https://github.com/JoveWorks/joveworks/commit/1545057d6514532987fd54e7efa1ce2c3adcf0dc))
## [0.8.0](https://github.com/JoveWorks/joveworks/compare/v0.7.2...v0.8.0) (2026-08-18)

### Features

* **catalogue:** add press-fit extraction ([efd6fce](https://github.com/JoveWorks/joveworks/commit/efd6fce68701907a71d572cf704a0c7b776d1269))
* **editor:** add equal spacing and grid snapping ([ed5bd2a](https://github.com/JoveWorks/joveworks/commit/ed5bd2aeb8cb8037ce3e014e77b270e9848b8e93))
* **editor:** add panel close buttons ([38b3998](https://github.com/JoveWorks/joveworks/commit/38b3998ff2b44655ea8f3db3eaf57b6f97f6f0bd))
* **editor:** expose grid snapping on canvas ([fd6a8c8](https://github.com/JoveWorks/joveworks/commit/fd6a8c8bf8ed3bfab740de992642d982ddaae21a))
* **nodes:** add ISO 286 tolerance lookups ([d0c0e70](https://github.com/JoveWorks/joveworks/commit/d0c0e701950648ee5c6e72967d0bc2decb5d0acc))

### Fixes

* **editor:** align panel header controls ([14f8b50](https://github.com/JoveWorks/joveworks/commit/14f8b50b8bfd47ddf291b8d60c2691fec0c7b20f))
* **editor:** clarify node keep-open control ([1cd8231](https://github.com/JoveWorks/joveworks/commit/1cd823123cd9f98d4b98158199b650827819fac2))
* **editor:** link version badge to release ([ed0e3d8](https://github.com/JoveWorks/joveworks/commit/ed0e3d803439cfda66eb095fefd767411390e3fa))
* **editor:** remove canvas grid button ([5983bee](https://github.com/JoveWorks/joveworks/commit/5983bee655adbe5897f53d7c9eb6d7377fe563d6))
* **editor:** separate settings menu category ([fc84f69](https://github.com/JoveWorks/joveworks/commit/fc84f6963fad2b130683f541aa10b3f68c5849d9))
* **editor:** show native shortcut modifier ([a2bcdee](https://github.com/JoveWorks/joveworks/commit/a2bcdeef8e3afc2bf2e63fa2b34d40ba65aec40b))
* **editor:** simplify favourites heading ([c6fd7e4](https://github.com/JoveWorks/joveworks/commit/c6fd7e4b133fd1bf145098ac774942d277cc6698))

### Documentation

* update editor backlog ([be381a2](https://github.com/JoveWorks/joveworks/commit/be381a2f273c5eaefd1121efbf14c4ed34d02bce))
## [0.7.2](https://github.com/JoveWorks/joveworks/compare/v0.7.1...v0.7.2) (2026-08-18)

### Features

* **editor:** track mobile course viewer use ([56d3123](https://github.com/JoveWorks/joveworks/commit/56d31235833a85fa3f0e29e3f90bee390653c2c1))
## [0.7.1](https://github.com/JoveWorks/joveworks/compare/v0.7.0...v0.7.1) (2026-08-18)

### Features

* **editor:** add mobile documentation landing ([e2e28f7](https://github.com/JoveWorks/joveworks/commit/e2e28f7a2f0819466331d1c1539f60ddc57a80e1))
* **editor:** persist workspace preferences ([caab5be](https://github.com/JoveWorks/joveworks/commit/caab5be26e1b85ec13b9c3dc58cf8753b163a6e6))
* **editor:** prototype NodeBook course viewer ([6a6e075](https://github.com/JoveWorks/joveworks/commit/6a6e075e71b984fc79e99f0f0783cd35f81b2f8c))

### Fixes

* **editor:** align unpack output ports ([b78a573](https://github.com/JoveWorks/joveworks/commit/b78a5735fba6961a1505e8f79a38656a29f4da2c))
* **editor:** enlarge port hitboxes ([d9e797c](https://github.com/JoveWorks/joveworks/commit/d9e797c6f5f1e8b961dfd5927d913769c92f5d88))
* **editor:** stack course viewer content ([d6cfdeb](https://github.com/JoveWorks/joveworks/commit/d6cfdeb7041aff388cbf060afed95b121041b75a))
## [0.7.0](https://github.com/JoveWorks/joveworks/compare/v0.6.0...v0.7.0) (2026-08-17)

### Features

* **editor:** add alpha analytics adapter ([4f695a8](https://github.com/JoveWorks/joveworks/commit/4f695a89de9afb08ac21fc7519a5dab763004192))
* **editor:** add per-port display unit overrides ([8821d5e](https://github.com/JoveWorks/joveworks/commit/8821d5e3b2a6e9cf9e235f7f439acfd0b6c14f5e))
* **editor:** favourite every palette node ([08ea1e6](https://github.com/JoveWorks/joveworks/commit/08ea1e6e1095cc777e3de782be3178c36cd442f5))

### Fixes

* **editor:** align output unit picker ([12fabd6](https://github.com/JoveWorks/joveworks/commit/12fabd6280ff01b61dabb21e2790bdff995c4c6c))
* **editor:** apply output unit row alignment ([f3f6b03](https://github.com/JoveWorks/joveworks/commit/f3f6b038c007eb8f4b6475238ea59c5c07280ed0))
* **editor:** clarify pack and unpack channels ([8bcf234](https://github.com/JoveWorks/joveworks/commit/8bcf23479f5c89e3762de273f586a41990ccc463))
* **editor:** clarify rejected unit connections ([e271ace](https://github.com/JoveWorks/joveworks/commit/e271acea27c752edf78300954919c8d9f98656b7))
* **editor:** contextualize section menu ([26c5bd9](https://github.com/JoveWorks/joveworks/commit/26c5bd93c7e171ccf22f34858be98f9a27076326))
* **editor:** hide persistent selection bounds ([86b560c](https://github.com/JoveWorks/joveworks/commit/86b560c33b14ce874ce823b00c11cd5fc9176069))
* **editor:** limit display unit overrides to outputs ([a69d4a4](https://github.com/JoveWorks/joveworks/commit/a69d4a43f4f3955b233bf81641c546b057b07ea5))
* **editor:** open menu from selection overlay ([a6803f2](https://github.com/JoveWorks/joveworks/commit/a6803f276a98e4fc38f76967bde953f7c2f9ff81))
* **editor:** open selection menu on Shift-click ([ae223cf](https://github.com/JoveWorks/joveworks/commit/ae223cf2bc3a9a25711f11faecdea1def918cdf1))
* **editor:** retain node menu for single marquee selection ([28c04dc](https://github.com/JoveWorks/joveworks/commit/28c04dc8c1e1ce8c9d938491d331987b60e94f2e))
* **editor:** right-align output unit picker ([de3a88a](https://github.com/JoveWorks/joveworks/commit/de3a88a7b3ac9e856cfff4868a537974270413dc))
* **editor:** right-align output unit row ([385d5fa](https://github.com/JoveWorks/joveworks/commit/385d5faf18d8adf3efe9e960581aab49ff1d5b08))
* **editor:** right-align selected display unit ([c193c3d](https://github.com/JoveWorks/joveworks/commit/c193c3dc2f3ac1133f733f6db3f885e6522b1c8d))
* **editor:** toggle selection with Shift-click ([5495b4e](https://github.com/JoveWorks/joveworks/commit/5495b4ec0407475b8b2693fd2c752a96927a3c25))
* **units:** omit prefixed display unit choices ([0d45b1d](https://github.com/JoveWorks/joveworks/commit/0d45b1dc9131d1144a1e6a22f2528bd26c43944f))

### Documentation

* update roadmap ([3a6d2d2](https://github.com/JoveWorks/joveworks/commit/3a6d2d25603d8697bb07b521260d69d4626b0e36))
## [0.6.0](https://github.com/JoveWorks/joveworks/compare/v0.5.0...v0.6.0) (2026-08-17)

### Features

* **editor:** add contour palette preference ([691e253](https://github.com/JoveWorks/joveworks/commit/691e2533c834ff092ea291377fe0ac8626f56d2a))
* **editor:** add English and Dutch localization ([6704a73](https://github.com/JoveWorks/joveworks/commit/6704a73246349161079270f95d47c2a9436b9fdf))
* **editor:** add stakeholder platform example ([880bd4a](https://github.com/JoveWorks/joveworks/commit/880bd4a9b7dc9bb588397815ae7f77808e362283))
* **editor:** edit output titles in notebook ([263dbdb](https://github.com/JoveWorks/joveworks/commit/263dbdb9860329bc081c5e42d7c0c6b82c2b672e))
* **editor:** localize example documents ([418b56c](https://github.com/JoveWorks/joveworks/commit/418b56c3486d97f60543ad389fcc6eb0112590a9))
* **editor:** localize remaining UX copy ([f53e52a](https://github.com/JoveWorks/joveworks/commit/f53e52ab659795fd7078549decfe16154657bb84))

### Fixes

* **editor:** align contour colorbar beside plot ([0a3ff23](https://github.com/JoveWorks/joveworks/commit/0a3ff23a4d6d3d63247b34031f4fa29f7c5f8455))
* **editor:** align contour colorbar with axes ([cfefd8d](https://github.com/JoveWorks/joveworks/commit/cfefd8d876fd35fe9d7d745989518004599170b9))
* **editor:** align plot legend swatches ([180437d](https://github.com/JoveWorks/joveworks/commit/180437de707b344e2c60cf95d27898b59e95c620))
* **editor:** compact contour colorbar ([0cad3e2](https://github.com/JoveWorks/joveworks/commit/0cad3e23050f1c92524d30c36aa7151e83e8b0b2))
* **editor:** format plot series legends ([7a5c365](https://github.com/JoveWorks/joveworks/commit/7a5c36546c7207bb57810ffb1c7389a25f245911))
* **editor:** localize application menus ([54cc6a6](https://github.com/JoveWorks/joveworks/commit/54cc6a603b5d6dfb18133b71a146ae8239bc6770))
* **editor:** localize editor controls and hints ([60b0a87](https://github.com/JoveWorks/joveworks/commit/60b0a87982af0f20abe798b97ccc7e1b885f8f87))
* **editor:** localize palette formula titles ([4a2ec13](https://github.com/JoveWorks/joveworks/commit/4a2ec1338f682d9a60ed52503a44f7b363d99ae4))
* **editor:** localize palette node entries ([063db98](https://github.com/JoveWorks/joveworks/commit/063db98f921d26fd8c1eb35ca70acfb18070e428))
* **editor:** place contour colorbar beside plot ([adf422a](https://github.com/JoveWorks/joveworks/commit/adf422af5a37f0ba864dc43848363e7719ed1142))
* **editor:** update notebook output titles live ([e807d4a](https://github.com/JoveWorks/joveworks/commit/e807d4aab68a5d91b6e808b19d3bf8a617fedfb7))
* **editor:** use swatches for plot series ([b8e003f](https://github.com/JoveWorks/joveworks/commit/b8e003fa974a17121333c7c70358334cbd002ef3))

### Refactoring

* **editor:** iconify notebook actions ([09c70fb](https://github.com/JoveWorks/joveworks/commit/09c70fbeb5718575e639256b2e57248f94d9a21f))

### Documentation

* **editor:** translate bundled catalogues to Dutch ([effe800](https://github.com/JoveWorks/joveworks/commit/effe8004ded94f333fbdde018f09e77c4a20b5f1))
## [0.5.0](https://github.com/JoveWorks/joveworks/compare/v0.4.1...v0.5.0) (2026-08-17)

### ⚠ BREAKING CHANGES

* Alpha-era MDS storage keys, equation libraries, package imports, and file naming are not migrated.

### Features

* rename project to JoveWorks ([857155e](https://github.com/JoveWorks/joveworks/commit/857155e52fe37436ab5dc88738a425861241084f))
## [0.4.1](https://github.com/JoveWorks/joveworks/compare/v0.4.0...v0.4.1) (2026-08-17)

### Fixes

* **editor:** add PDF export margins ([f3659bf](https://github.com/JoveWorks/joveworks/commit/f3659bf717c1dd5f870635e30c9062e7321f400d))
* **editor:** typeset axis labels consistently ([4d9e4bc](https://github.com/JoveWorks/joveworks/commit/4d9e4bc61f0084fb622d3f5b24e82dda81c4cbed))
* **kernel:** broadcast table columns across sweep axes ([93cd302](https://github.com/JoveWorks/joveworks/commit/93cd302ff131d493c866a7b9861928c23dd5785f))

### Documentation

* add contour palette backlog item ([b011cdb](https://github.com/JoveWorks/joveworks/commit/b011cdb192a987e6e4db1a59a95ffe395557d639))
* note axis label math rendering ([2946f9a](https://github.com/JoveWorks/joveworks/commit/2946f9a6519366cd504a632ed30ca78aa37a8b7d))

## [0.4.0](https://github.com/JoveWorks/joveworks/compare/v0.3.2...v0.4.0) (2026-08-17)

### Features

* add public machining catalogue ([f7d86b3](https://github.com/JoveWorks/joveworks/commit/f7d86b3e77d2bb386f02f3133bc4b66b99a6bcdf))
* complete catalogue and routing roadmap items ([17d11a7](https://github.com/JoveWorks/joveworks/commit/17d11a7630e182edc4cf5eca4e30de5b3fc7f49c))
* **editor:** add milling power-envelope example ([59dc90b](https://github.com/JoveWorks/joveworks/commit/59dc90b2cb8ffcdbff1f4eb93cb4cd0806048009))
* **editor:** add selection alignment and arrange actions ([51a1ee0](https://github.com/JoveWorks/joveworks/commit/51a1ee0df16adaa0efe4e9a1818799ef4c11f441))
* **editor:** add tutorials to examples ([2b43e58](https://github.com/JoveWorks/joveworks/commit/2b43e58c28376d4d31e01eeeedca051c72af867f))
* **editor:** animate tutorial steps ([bee9e91](https://github.com/JoveWorks/joveworks/commit/bee9e911f496d4ea71d8fe8a77e6629a8678b8fa))
* **editor:** clarify edge and frame hover ([9aa4309](https://github.com/JoveWorks/joveworks/commit/9aa4309e33b6bd43cc0a471edd7f3604399afad0))
* **editor:** link directly to example notebooks ([b31ee40](https://github.com/JoveWorks/joveworks/commit/b31ee40d5982976f03a9c9c833a33fbe14ba9af8))
* **editor:** offer all compatible quick-add nodes ([b600b7f](https://github.com/JoveWorks/joveworks/commit/b600b7fc9a312405f04bc420b8e7a55cd31d44a4))
* **editor:** typeset notebook prose ([38aa007](https://github.com/JoveWorks/joveworks/commit/38aa007c07c392bdf2967efabd372ace24f3f0f2))

### Fixes

* **editor:** align header metadata spacing ([fa4b455](https://github.com/JoveWorks/joveworks/commit/fa4b4558e926c59b516452bb92f7f29519fe65e1))
* **editor:** align notebook values and mark local builds ([fb5e2d3](https://github.com/JoveWorks/joveworks/commit/fb5e2d3e0e264549046580a70a9b7a6028c18fd5))
* **editor:** align wrapped notebook values ([13fa6b8](https://github.com/JoveWorks/joveworks/commit/13fa6b881e290672374e137fdfea5ffee45ce254))
* **editor:** auto-size notebook text fields ([82309f9](https://github.com/JoveWorks/joveworks/commit/82309f97182c65b2d2a9b66166a7011d89b402f0))
* **editor:** make edge endpoints visible ([701b565](https://github.com/JoveWorks/joveworks/commit/701b5653149e668b0755f97b9f58456b055d8152))
* **editor:** smooth tutorial transitions ([b598183](https://github.com/JoveWorks/joveworks/commit/b598183329911b4eb11dc9d024e56fa7f22d5b88))
* **editor:** space document title separator ([0338eda](https://github.com/JoveWorks/joveworks/commit/0338eda961ffde583921f5aa133ec90b9e40a995))
* **editor:** strengthen edge endpoint hover ([222b2ba](https://github.com/JoveWorks/joveworks/commit/222b2bab515ff287648b3ca2c63d0596eca38095))
* **editor:** strengthen section frame accent ([93b2fb1](https://github.com/JoveWorks/joveworks/commit/93b2fb1be93560e0a68a5f03ecbc502109789a90))
* **editor:** adopt JoveWorks branding ([499316b](https://github.com/JoveWorks/joveworks/commit/499316b0379d3d0d5c5e08a8ca95b02728713729))

### Documentation

* document worktree dependency setup ([d2590e0](https://github.com/JoveWorks/joveworks/commit/d2590e032e14ea93b47ecbb380bb2e03b7efcf7e))
* refresh roadmap backlog ([9543956](https://github.com/JoveWorks/joveworks/commit/9543956c83adcfbe132017bc105e52d751a862df))
* remove completed quick-add backlog item ([67a8766](https://github.com/JoveWorks/joveworks/commit/67a8766022714abecfef1466c0144659f22360b7))
* **roadmap:** update completed and naming items ([5d20096](https://github.com/JoveWorks/joveworks/commit/5d200968d19e0d3b7c0679c29dc3d4379b77f9d7))
* update roadmap status and follow-ups ([a9d4d91](https://github.com/JoveWorks/joveworks/commit/a9d4d914e3f46e2b9fabc6f980e56b0b407f8007))
## [0.3.2](https://github.com/JoveWorks/joveworks/compare/v0.3.1...v0.3.2) (2026-08-17)

### Features

* **editor:** add canvas control reference ([ec7ddcc](https://github.com/JoveWorks/joveworks/commit/ec7ddcc7aec10b4d3537e723690a2e0a9cd4f4e1))

### Fixes

* **editor:** move canvas controls to help menu ([06394d1](https://github.com/JoveWorks/joveworks/commit/06394d1af14f4ed48b89383b400806fa3a869cee))
* **editor:** show autosave restore notice once ([694f779](https://github.com/JoveWorks/joveworks/commit/694f779370845b238b4f5ef7d8637d788730c2ff))
* **editor:** strengthen section frame hover accent ([ffbcb72](https://github.com/JoveWorks/joveworks/commit/ffbcb7205a2427ca17ceeef8a50a7a8b50c745dd))
* **editor:** typeset notebook result titles ([c723c40](https://github.com/JoveWorks/joveworks/commit/c723c40b2dac9e08da03955f6c4b1b0e932c28da))
## [0.3.1](https://github.com/JoveWorks/joveworks/compare/v0.3.0...v0.3.1) (2026-08-17)

### Features

* **editor:** add JoveWorks header branding ([09ef5aa](https://github.com/JoveWorks/joveworks/commit/09ef5aa5643235804a87a6aef6630a64d482ba8d))
* **editor:** typeset mathematical node titles ([1c2a489](https://github.com/JoveWorks/joveworks/commit/1c2a489b66243e01b02f203a348bc983b8c08c44))
* let ports declare a preferred display unit ([c0f7df8](https://github.com/JoveWorks/joveworks/commit/c0f7df882bf0f33e2f169edffd774c42689d213c))

### Fixes

* **editor:** deduplicate autosave restore notice ([e20f4f0](https://github.com/JoveWorks/joveworks/commit/e20f4f088169df6f741c71f683cace82f144de38))
* **editor:** parenthesize units in interface labels ([003bf0a](https://github.com/JoveWorks/joveworks/commit/003bf0a59a54fb7389bb940af8816dadd07d6546))

### Documentation

* consolidate agent guidance and expand roadmap ([128fce5](https://github.com/JoveWorks/joveworks/commit/128fce54a709e0d515878e09ccb0fe1b0f0fbcd0))
* Roadmap items. ([d1e55ba](https://github.com/JoveWorks/joveworks/commit/d1e55ba76ab2cfd3d1730aa42fb0b0a824dba03e))
* Roadmap items. ([f3e78e5](https://github.com/JoveWorks/joveworks/commit/f3e78e5fbcb7f55c1566b20f06b36c479dc2764a))
* Roadmap items. ([ad24bda](https://github.com/JoveWorks/joveworks/commit/ad24bdaac56900a8062c47c173cfbdd8fe7e5649))
* Roadmap items. ([8dfde7a](https://github.com/JoveWorks/joveworks/commit/8dfde7a5929aff4766f8cf9e0a11d070d1b323ee))
* trim stale milestone-1 status blurbs from OVERVIEW and README ([e3eb85a](https://github.com/JoveWorks/joveworks/commit/e3eb85adbff540eb383813901643de42777e8c01))
## [0.3.0](https://github.com/JoveWorks/joveworks/compare/v0.2.0...v0.3.0) (2026-08-16)

### Features

* **editor:** add a "?" help button linking to the docs site ([10f9e66](https://github.com/JoveWorks/joveworks/commit/10f9e6631257d6793165bb99b22070a6f3adbacd))
* **editor:** add a first-load tutorial walkthrough ([8c4c0c8](https://github.com/JoveWorks/joveworks/commit/8c4c0c80b698278183c6748b53473aa6765424bc))
* **editor:** add feedback guide next to version badge ([1c34813](https://github.com/JoveWorks/joveworks/commit/1c348135cc23eef3f3016e098a5b07c5a7ae32e1))
* **editor:** auto-arrange the graph ([8a29b10](https://github.com/JoveWorks/joveworks/commit/8a29b1066e659e738c52483fb0ec8f35d59b8860))
* **editor:** confirm before discarding unsaved work ([172b7c2](https://github.com/JoveWorks/joveworks/commit/172b7c27b5e0720dcbd765229ddb667884e1bec4))
* **editor:** draw waypoint, pack and unpack, and splice them on delete ([8396665](https://github.com/JoveWorks/joveworks/commit/8396665a948e2b29333a9bb96d77e775a6c9ef94))
* **editor:** give check output a wireable threshold port ([323328d](https://github.com/JoveWorks/joveworks/commit/323328d7292e483c0b95b964712457a21a42b7ac))
* **editor:** highlight canvas frame/node on notebook hover ([5e4047b](https://github.com/JoveWorks/joveworks/commit/5e4047b838823b15b4ce57a8152b24663f862130))
* **editor:** link the docs site from the Help ribbon ([e9ba348](https://github.com/JoveWorks/joveworks/commit/e9ba3480f23750d1d9fbb7ed2599d92ce38c5748))
* **editor:** make auto-arrange topology-aware ([7a610fc](https://github.com/JoveWorks/joveworks/commit/7a610fc622311d4d5b5f931bdb62aed206ae8b0d))
* **kernel:** resolve and evaluate waypoint, pack and unpack ([17c4565](https://github.com/JoveWorks/joveworks/commit/17c45655fdccb3f30933608d24880015531d508b))
* **schema:** add waypoint, pack and unpack node kinds, and a bundle port ([d9d1eac](https://github.com/JoveWorks/joveworks/commit/d9d1eacf8173a337ab1abcf2352a618021bdc5f6))

### Fixes

* anchor .vitepress/cache/ ignore pattern with **/ ([ccbb9e0](https://github.com/JoveWorks/joveworks/commit/ccbb9e011705fa40434f60cc5e163e14792af44f))
* **editor:** derive the docs link from window.location.origin ([0c6a1d4](https://github.com/JoveWorks/joveworks/commit/0c6a1d440ec42288b6f7a97beb081b638c13fa03))
* **editor:** fit the viewport, target the notebook precisely, keep it open ([b7e9393](https://github.com/JoveWorks/joveworks/commit/b7e93930759b133a06e9e09b4b600c7ee5563667))
* **editor:** keep the tutorial on-script and on-screen ([22120d6](https://github.com/JoveWorks/joveworks/commit/22120d6e81f3bdacd5cbd84798a953eeede6fdcf))
* **editor:** point the docs link at the docs dev server in dev ([5cd8430](https://github.com/JoveWorks/joveworks/commit/5cd8430377213d360e2156ad65bda6f34f44b2b9))
* **editor:** stop the tutorial caption's clamp from oscillating ([e9cae35](https://github.com/JoveWorks/joveworks/commit/e9cae35082c76e57a02baa527cba0f32a8c50447))
* **editor:** wire waypoint/pack/unpack into the help-link docs ([afa4f55](https://github.com/JoveWorks/joveworks/commit/afa4f55bb4079eedd401505f8bcf782c4669d53a))
* **kernel:** quarantine waypoint, pack and unpack pending a redesign ([1f0b70d](https://github.com/JoveWorks/joveworks/commit/1f0b70d88fa137adef9d2e905c30b527799194d9))

### Documentation

* add notebook-hover and feedback-channel backlog items ([ce022a2](https://github.com/JoveWorks/joveworks/commit/ce022a2db97e90577fa8e1fa693d2845aa64eaae))
* add VitePress docs site package ([7f6a023](https://github.com/JoveWorks/joveworks/commit/7f6a02376ad3a69103b53f53c52ccdde334f0600))
* integrate inbox into roadmap — open questions, backlog, settled decisions ([6c966b2](https://github.com/JoveWorks/joveworks/commit/6c966b2a5b8d03e3e41bc3f5b1a449c571c7a55f))
* record waypoint/pack browser-testing findings; ignore VitePress cache ([a5de8a0](https://github.com/JoveWorks/joveworks/commit/a5de8a0b1fc1dae1fe8eedf62b183d9e91fb0586))
* **roadmap:** note editor backlog items for select-all and duplicate restore toast ([804c2f2](https://github.com/JoveWorks/joveworks/commit/804c2f2f11b757f11f2f4b93a53359bc6dafb48f))
* serve the docs site at /docs/ under the app's own origin ([1af60d7](https://github.com/JoveWorks/joveworks/commit/1af60d758ff686fcb1ebd02abfaf2188efe98636))
## [0.2.0](https://github.com/JoveWorks/joveworks/compare/v0.1.0...v0.2.0) (2026-08-16)

### Features

* add a slider ValueSpec kind for quick nudging ([ae86082](https://github.com/JoveWorks/joveworks/commit/ae860826d4be3865f34d061c84cb51d13701ad52))
* add the equation output node (ROADMAP.md) ([066afce](https://github.com/JoveWorks/joveworks/commit/066afce33552a93438b05a86a07851cafddf133e))
* **editor:** a plot's threshold as an optional override port ([6443e02](https://github.com/JoveWorks/joveworks/commit/6443e027b7d125e1458583fc7bdea2a4840a7edc))
* **editor:** auto-restore autosave silently; New and Recent in the File ribbon ([3063968](https://github.com/JoveWorks/joveworks/commit/3063968d2e39460196b037ff8baad503ae31c48b))
* **editor:** autosave to localStorage with restore-on-load prompt ([f7ddf88](https://github.com/JoveWorks/joveworks/commit/f7ddf882e6be6c3b661ad879f47e550b34ad3c0c))
* **editor:** glob the catalogues directory instead of a hardcoded file ([91b9f49](https://github.com/JoveWorks/joveworks/commit/91b9f49c66574323c04727380d375df2c005115f))
* **editor:** notebook section titles are editable in the notebook ([258e9d7](https://github.com/JoveWorks/joveworks/commit/258e9d7e8cbe1070409dc76d23637490e94f15ee))
* **editor:** show app version in the ribbon; document title moves into the notebook ([fc88ad5](https://github.com/JoveWorks/joveworks/commit/fc88ad50955f9ed01ad6f7090a14160afc525181))

### Fixes

* **editor:** a section drag could still drop as text on the notebook title ([42fe446](https://github.com/JoveWorks/joveworks/commit/42fe446e8b977076d6af75e55597bd38d3f13682))
* **editor:** adapt an unwired input node's unit to its target on connect ([c058a6f](https://github.com/JoveWorks/joveworks/commit/c058a6fc9c97722c7135450d593f41ee4daf0aef))
* **editor:** align palette hints in their own column ([076b1ef](https://github.com/JoveWorks/joveworks/commit/076b1efe5531dc83d6030fcea6aa0eb15c8d6599))
* **editor:** auto-size a plot's threshold field ([9db5fec](https://github.com/JoveWorks/joveworks/commit/9db5fecf87e37c9d1e41e252fb6f166bbea91931))
* **editor:** drop cleanup was skippable, letting the line get stuck ([bff8e31](https://github.com/JoveWorks/joveworks/commit/bff8e31f64ace70b6f18db3197b7b14aa01ddbb2))
* **editor:** left-align the "Not in a section" pseudo-header title ([92f7cb9](https://github.com/JoveWorks/joveworks/commit/92f7cb9b2167a0f0314f1f960dfddbae35dd1798))
* **editor:** make the drag handle the flex gap, not the tiny grip icon ([34ec4f5](https://github.com/JoveWorks/joveworks/commit/34ec4f539f996db69e05b8c6162747c905a2bc4b))
* **editor:** move formula verified/source badges into the dropdown ([66504fc](https://github.com/JoveWorks/joveworks/commit/66504fc3e66f84f5c6b1b251eea65405b935e524))
* **editor:** normalise after-A/before-B into one canonical drop state ([5396da5](https://github.com/JoveWorks/joveworks/commit/5396da59dc4a459f59ba4a785a5ebc44a5f6d6d0))
* **editor:** one shared drag-over state, not one per section ([4800f0a](https://github.com/JoveWorks/joveworks/commit/4800f0abae9a33c8c6b7b52e62d1907a41b12c38))
* **editor:** reorder dropdown provenance, label the catalogue source ([4f7a105](https://github.com/JoveWorks/joveworks/commit/4f7a10553305c72dcdbe2714bd111f8100d011c9))
* **editor:** ribbon buttons stay clickable while a menu is open ([c52e6a5](https://github.com/JoveWorks/joveworks/commit/c52e6a545630b0ef9f1ce29af366c8c8187a4b8b))
* **editor:** ribbon dropdown stays open on a short close delay ([27d7d3f](https://github.com/JoveWorks/joveworks/commit/27d7d3fc5c9f781abbe9d2bf591ac21c986032b2))
* **editor:** round a slider's dragged value, and wrap its detail row ([7f82f0f](https://github.com/JoveWorks/joveworks/commit/7f82f0fd0cdbe72315b40ba29ea1d89a8da8cbe7))
* **editor:** scope drag-to-reorder to the grip, not the whole section ([62e77ed](https://github.com/JoveWorks/joveworks/commit/62e77ed5bfbc216cc192bbd6227ec598738ca11b))
* **editor:** section frames respect selection, resize, and read order ([0d6c6e1](https://github.com/JoveWorks/joveworks/commit/0d6c6e1797488f1d23c66cde4a2456d5909b27bc))
* **editor:** section title/note/caption fields lost double-click select ([60cc52d](https://github.com/JoveWorks/joveworks/commit/60cc52d2f1faba105fb849e2b2d42ba97fc106b2))
* **editor:** show catalogue source on canvas formula nodes ([6367c2c](https://github.com/JoveWorks/joveworks/commit/6367c2c26f263f8aff05b2172702a13bc36b1720))
* **editor:** size section-title to its text, not the whole row ([39962bb](https://github.com/JoveWorks/joveworks/commit/39962bb46bebf7f500b1292d61022ef9389db3ac))
* **editor:** slider input dragged the node instead of the thumb ([9c28f29](https://github.com/JoveWorks/joveworks/commit/9c28f29bf62a4c1f82cf54061df60b0a5f3c8e40))
* **editor:** widen default palette panel ([a82a2ed](https://github.com/JoveWorks/joveworks/commit/a82a2ed46356293d0e250e6e662ad1a593b3e194))

### Documentation

* clarify worktree agents commit freely, just not merge to main ([803358a](https://github.com/JoveWorks/joveworks/commit/803358ab4af49d5e1d58961c4e3b66bbdfc27968))
* drop shipped closure-node item from the roadmap ([9dcf1a4](https://github.com/JoveWorks/joveworks/commit/9dcf1a46abf4493eb627e0a1edab3cf0063b712c))
* drop shipped items from the roadmap ([0586900](https://github.com/JoveWorks/joveworks/commit/0586900ba2cccb098b092791a94951fcde1b5aed))
* drop the resolved section-frame items from the roadmap ([2c6e24b](https://github.com/JoveWorks/joveworks/commit/2c6e24b9efbba6e03ca4686b9c4da253dd544471))
* note check output node missing a threshold port like plot ([82ccd2d](https://github.com/JoveWorks/joveworks/commit/82ccd2d4abef4b2f295dd51176e4452cbce20dd9))
* reframe editor backlog items on the roadmap ([a119c61](https://github.com/JoveWorks/joveworks/commit/a119c61398f7d966839b73c14e12ae417526fd0d))
* require checking a worktree branch's work before merging ([92f779d](https://github.com/JoveWorks/joveworks/commit/92f779da7d22f2145156a6d2ea9946b16d2d2a21))
* spell out Conventional Commits types and scope rules ([a138245](https://github.com/JoveWorks/joveworks/commit/a138245cf5d435f93967e4153d7b48aa7997f8b9))
* update roadmap for CI disable, v0.1.0, and the catalogue glob ([f29907a](https://github.com/JoveWorks/joveworks/commit/f29907a9e79f4f89c0d540e3e8296c845b4d017a))
## 0.1.0 (2026-08-16)

### Fixes

* a bare compare threshold used value's canonical unit, not its display unit ([03d1012](https://github.com/JoveWorks/joveworks/commit/03d10129af479c52dff3cf6a7f6f9bb184ef9a4d))
* a fresh compare node's threshold refused to wire to any dimensioned value ([c954073](https://github.com/JoveWorks/joveworks/commit/c954073601b2b60f03fa1201f90b357245e91163))
* a table column's name froze at wire time, never following a rename ([4f03e53](https://github.com/JoveWorks/joveworks/commit/4f03e536741b2dea2e65576ad8e423e410df5bab))
* engineering notation showed a bare e+0 for values already in range ([2905585](https://github.com/JoveWorks/joveworks/commit/290558557eeac56d98c5a5a8c4a1e79cef7e9ca8))
* switching an output node's kind stranded its existing wire ([a485b84](https://github.com/JoveWorks/joveworks/commit/a485b84d3841e3c6cb8f4f2b0b2c459de204ddc7))
* the quick-add menu couldn't create a compare or table node ([fcf0edf](https://github.com/JoveWorks/joveworks/commit/fcf0edf8f3cac50968ae35d59950b10b49ba23d8))

### Documentation

* settle S74 and update UI-FEEDBACK.md and NEXT.md for the second pass ([409537f](https://github.com/JoveWorks/joveworks/commit/409537f0c1a20bf6ded01f7cce87542e3f5f9ea5))
