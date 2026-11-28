/* The staff admin page (dark palette = the Polaris website tokens.css) (served on /admin, behind Cloudflare Access). One file, no build step. */
export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Polaris Operations</title><link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgODE5MiA4MTkyIj48ZGVmcz48c3R5bGU+CiAgICAgIC5jbHMtMXtmaWxsOnVybCgjcmFkaWFsLWdyYWRpZW50LTEpfQogICAgICAuY2xzLTJ7ZmlsbDojZmZmZmZmfQogICAgPC9zdHlsZT48cmFkaWFsR3JhZGllbnQgaWQ9InJhZGlhbC1ncmFkaWVudC0xIiBjeD0iNzI3Mi41MzQiIGN5PSIxMjIwLjk5NiIgcj0iMTAxMzcuOTQ5IiBmeD0iNjI4MC44NjciIGZ5PSI0OTk3LjIxNyIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIG9mZnNldD0iMC4xNDA0IiBzdG9wLWNvbG9yPSIjMWE2NzcwIi8+PHN0b3Agb2Zmc2V0PSIwLjU0NzMiIHN0b3AtY29sb3I9IiMwZDRmNTYiIGRhdGEtdmMtbWlkcG9pbnQ9IjAuNTIzMSIvPjxzdG9wIG9mZnNldD0iMC45MTg0IiBzdG9wLWNvbG9yPSIjMDAzNjNiIi8+PC9yYWRpYWxHcmFkaWVudD48L2RlZnM+PGcgaWQ9IkFzc2V0XzM0IiBkYXRhLW5hbWU9IkFzc2V0IDM0Ij48Zz48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iODE5MiIgaGVpZ2h0PSI4MTkyIiBjbGFzcz0iY2xzLTEiLz48cGF0aCBkPSJNMzk2Mi41OTkgMTAwMS42NjcgTDQxMDEuODE5IDI3OC40MDEgTDQyNDYuMjcyIDEwMDEuNDkyIEw0MjQ2LjI3MiAxMDAxLjQ5MiBDNDg1My41MDYgMTAyOC42OTQgNTQxNC44ODkgMTIzMi4wODIgNTg4MC41MjkgMTU2MS43NjQgTDYwMzYuOTA1IDE0MzkuNTYyIEw2MTY4LjkwOSAxMzQwLjMzIEM2MTcwLjAxMSAxMzM5LjUwMiA2MTcxLjM0MSAxMzM5LjAzMiA2MTcyLjcxOSAxMzM4Ljk4MyBMNjE4Mi4xNDkgMTMzOC42NTMgQzYxODYuNzQ1IDEzMzguNTEgNjE5MC4xMzIgMTM0Mi45MTggNjE4OC44MDMgMTM0Ny4zMjUgTDYxODYuMDg3IDEzNTYuMzM0IEM2MTg1LjY4OSAxMzU3LjY1NCA2MTg0Ljg5NiAxMzU4LjgyIDYxODMuODE0IDEzNTkuNjc0IEw2MDU0LjQwMSAxNDYxLjg1NyBMNTkwOC4wNTEgMTU4MS40NzggTDU5MDguMDUxIDE1ODEuNDc4IEM2NjQ2LjA3MSAyMTE2LjI3MSA3MTM3LjA3MSAyOTcxLjA1OCA3MTc3LjQ1MSAzOTQyLjIzMyBMNzE3Ny40NTEgMzk0Mi4yMzMgTDc4MDEuMzI1IDQwNzEuNzI4IEw3MTc3LjY1NiA0MTk3LjAyOSBDNzExNC4wMTUgNTc4OS42NzIgNTgzOC41NjkgNzA3MC41MDkgNDI0OC4xNDQgNzE0Mi43MTUgTDQyNDguMTQ0IDcxNDIuNzE1IEw0MTAzLjc0NSA3ODg4LjcyOCBMNDEwMy43NDUgNzg4OC4zODUgTDQxMDMuNjgyIDc4ODguNzI4IEwzOTU2LjUwMyA3MTQyLjMzNyBDMzM3OC44NzcgNzExNC42MDcgMjg0My4wNTYgNjkyNy40MzYgMjM5Mi4wOSA2NjIzLjg3NiBMMjM4NS40NzcgNjYyNS41NTYgTDIyNzEuODI1IDY2NTAuNzA5IEwyMTY3Ljc5NiA2NjY5LjkyMyBMMjA3Ni40MjQgNjY4My4xNDIgTDE5OTUuMzc3IDY2OTEuMDk3IEwxOTIyLjMyMyA2Njk0LjUzMyBDMTkyMi4xOTIgNjY5NC41MzkgMTkyMi4wNiA2Njk0LjU0MSAxOTIxLjkyOSA2Njk0LjU0IEwxODU5LjM5IDY2OTMuODEzIEMxODU5LjIzNyA2NjkzLjgxMSAxODU5LjA4NCA2NjkzLjgwNCAxODU4LjkzMSA2NjkzLjc5MiBMMTgwMy4xNTYgNjY4OS4zMjkgQzE4MDIuOTg1IDY2ODkuMzE1IDE4MDIuODE1IDY2ODkuMjk1IDE4MDIuNjQ1IDY2ODkuMjY4IEwxNzUyLjg2OCA2NjgxLjQyMyBDMTc1Mi42NzQgNjY4MS4zOTMgMTc1Mi40ODEgNjY4MS4zNTQgMTc1Mi4yOSA2NjgxLjMwNiBMMTcwOC44ODcgNjY3MC41MDIgQzE3MDguNjYxIDY2NzAuNDQ2IDE3MDguNDM4IDY2NzAuMzc4IDE3MDguMjE5IDY2NzAuMjk5IEwxNjcwLjA1IDY2NTYuNDYxIEMxNjY5LjgwNyA2NjU2LjM3MyAxNjY5LjU2OSA2NjU2LjI3MSAxNjY5LjMzOCA2NjU2LjE1NiBMMTYzNS43MjUgNjYzOS4zODMgQzE2MzUuNDczIDY2MzkuMjU4IDE2MzUuMjMgNjYzOS4xMTYgMTYzNC45OTYgNjYzOC45NiBMMTYwNS41MzggNjYxOS4zMTEgQzE2MDUuMjc2IDY2MTkuMTM3IDE2MDUuMDI2IDY2MTguOTQ0IDE2MDQuNzkxIDY2MTguNzM0IEwxNTc5Ljk2OCA2NTk2LjU4NCBDMTU3OS43MTYgNjU5Ni4zNTkgMTU3OS40ODIgNjU5Ni4xMTYgMTU3OS4yNjYgNjU5NS44NTYgTDE1NTguMzkgNjU3MC42NTEgQzE1NTguMTcyIDY1NzAuMzg4IDE1NTcuOTc0IDY1NzAuMTA5IDE1NTcuNzk5IDY1NjkuODE3IEwxNTQwLjg5IDY1NDEuNTkxIEMxNTQwLjcxOSA2NTQxLjMwNSAxNTQwLjU2OSA2NTQxLjAwNyAxNTQwLjQ0MiA2NTQwLjcgTDE1MjcuNTkyIDY1MDkuNTY1IEMxNTI3LjQ4MiA2NTA5LjI5NyAxNTI3LjM4OCA2NTA5LjAyMiAxNTI3LjMxMyA2NTA4Ljc0MiBMMTUxNS41MzUgNjQ2NC44NyBDMTUxNS40NzggNjQ2NC42NiAxNTE1LjQzMiA2NDY0LjQ0NiAxNTE1LjM5NiA2NDY0LjIzMSBMMTUwNy43NTEgNjQxOC4zNDcgQzE1MDcuNzE3IDY0MTguMTQyIDE1MDcuNjkyIDY0MTcuOTM1IDE1MDcuNjc3IDY0MTcuNzI3IEwxNTA0LjE1NyA2MzY5LjEzOSBDMTUwNC4xNDIgNjM2OC45NDMgMTUwNC4xMzcgNjM2OC43NDcgMTUwNC4xNCA2MzY4LjU1IEwxNTA0LjkxOSA2MzE3LjAzNCBDMTUwNC45MjIgNjMxNi44NTUgMTUwNC45MzEgNjMxNi42NzcgMTUwNC45NDggNjMxNi40OTkgTDE1MTAuMjQ5IDYyNjAuNzM2IEMxNTEwLjI2NCA2MjYwLjU3OCAxNTEwLjI4NSA2MjYwLjQyIDE1MTAuMzExIDYyNjAuMjYzIEwxNTIwLjIxMSA2MjAxLjAyNiBDMTUyMC4yMzUgNjIwMC44ODEgMTUyMC4yNjQgNjIwMC43MzYgMTUyMC4yOTggNjIwMC41OTMgTDE1MzUuMTE5IDYxMzcuNjc0IEMxNTM1LjE1IDYxMzcuNTQxIDE1MzUuMTg2IDYxMzcuNDA5IDE1MzUuMjI1IDYxMzcuMjc5IEwxNTU1LjQ3NyA2MDY5Ljk0NyBDMTU1NS41MTIgNjA2OS44MzIgMTU1NS41NDkgNjA2OS43MTggMTU1NS41OSA2MDY5LjYwNSBMMTU4Mi4wNjQgNTk5Ni4wODQgTDE2MTQuNTMgNTkxOC4wMjcgTDE2MjcuNjE0IDU4OTAuMTYzIEMxMjc1LjEzNyA1NDEwLjM5MiAxMDU4LjYgNDgyNC41NDMgMTAzNC43OCA0MTg5LjM5MyBMMzkwLjY3NSA0MDU3LjgwNyBMMTAzNS43MzcgMzkzMS42NzggQzExMDcuMDE1IDIzNDYuOTM0IDIzNzguMjkgMTA3NC42MSAzOTYyLjU5OSAxMDAxLjY2NyBaIE00MTAxLjkxMSA1MTAuMzY0IEw0MTAyLjA5NSA5OTguMzY3IEM0MTAyLjA5NSA5OTguMzY3IDQxMDIuMDk1IDk5OC4zNjcgNDEwMi4wOTUgOTk4LjM2NyBMNDEwMi4xMzIgMTA5NS4xMTggQzQxMDIuMTMyIDEwOTUuMTE4IDQxMDIuMTMyIDEwOTUuMTE4IDQxMDIuMTMyIDEwOTUuMTE4IEw0MTAyLjIwOCAxMjk3Ljk3OCBDNDEwMi4yMDggMTI5Ny45NzggNDEwMi4yMDggMTI5Ny45NzggNDEwMi4yMDggMTI5Ny45NzggTDQxMDIuMjMxIDEzNTguNDQ3IEM0MTAyLjIzMSAxMzU4LjQ0NyA0MTAyLjIzMSAxMzU4LjQ0NyA0MTAyLjIzMSAxMzU4LjQ0NyBMNDEwMi44ODEgMzA3Ny44NTEgTDQxMDIuODgxIDMwNzcuODUxIEw0MTAyLjkxMSAzMTU2LjA1MSBMNDEwMi45MTEgMzE1Ni4wNTEgTDQxMDMuMDQzIDM1MDcuMjIyIEw0MTAzLjA0MyAzNTA3LjIyMiBMNDEwMy4yNTMgNDA2MS41NjMgTDQxMDMuMjUzIDQwNjEuNTYzIEw0MTAzLjI1NCA0MDY1LjI3IEw0MTAwLjQ3NyA0MDY4LjAxIEw0MDk4LjY4MSA0MDY5Ljc4MSBMNDA5OC42NzggNDA2OS43ODMgTDQwOTcuNjQ2IDQwNjguNzUzIEw0MDk4LjY3NSA0MDY5Ljc4NiBMNDA5Ni44MzkgNDA3MS41OTcgTDQwNTcuMzYgNDExMC41MyBMMzg0Ni40NDQgNDMxOC41MjkgTDM4NDYuNDQyIDQzMTguNTMxIEwzNzc3LjQ2NSA0Mzg3LjUyMiBMMzc1Ni40NSA0NDA4LjU0MiBMMzUxMS44OTEgNDY1My4xNDggTDM1MTEuODkxIDQ2NTMuMTQ4IEwzNTIwLjY1NiA0Njk3LjU5OCBMMzU3Ni45NDcgNDk4My4wNjYgTDM1NzYuOTQ3IDQ5ODMuMDY2IEwzNzkxLjQ3NSA2MDcxLjAwOCBMMzc5MS40NzUgNjA3MS4wMDggTDM4MDMuMzc0IDYxMzEuMzQ5IEwzODAzLjM3NCA2MTMxLjM0OSBMMzkyOC4yNTQgNjc2NC42NTQgTDM5NDAuMzQ5IDY4MjUuOTk1IEwzOTgzLjg3IDcwNDYuNzAxIEw0MDAzLjEgNzE0NC4yMjQgTDQxMDMuNzIxIDc2NTQuNTAzIEw0MTAzLjcyMSA3NjM5LjMwMyBMNDEwMy42NzIgNzE0NS45MjUgTDQxMDMuNjYyIDcwNDkuMTc1IEw0MTAzLjY0MSA2ODMwLjkxMyBMNDEwMy42MzUgNjc3MC40NDQgTDQxMDMuNTU5IDYwMDMuNTYxIEw0MTAzLjU1MyA1OTQxLjEzNiBMNDEwMy40NDEgNDgxNC42NjggTDQxMDMuNDM3IDQ3NjguNDExIEw0MTAzLjQyNCA0NjM5LjQyIEw0MTAzLjQyMSA0NjA0LjQxNSBMNDEwMy4zNzQgNDEyOS44MjQgTDQxMDMuMzY4IDQwNzQuNDk1IEw0MTAzLjM2OCA0MDc0LjQ2MSBMNDQ0MC4yNzUgNDQxMC41MDggTDQxMDMuMzY4IDQwNzQuNDU2IEw0MTAzLjM2OCA0MDY4LjAwNiBMNDEwMy4zNjcgNDA2NS4zODUgTDQxMDUuOTYyIDQwNjguMDAzIEw0Njg0LjM0NyA0NjUxLjcwMSBMNDY4NC42MTIgNDY1MS42NDcgTDUwMDkuNzc2IDQ1ODYuMzE5IEw2ODA4LjAzNCA0MjI1LjAzMiBMNjg2OS4yODMgNDIxMi43MjYgTDcwODEuODE3IDQxNzAuMDI2IEw3MTc5LjE2OCA0MTUwLjQ2NyBMNzU3MC42MDMgNDA3MS44MjQgTDc1NjguMDg0IDQwNzEuMzIxIEw3MTgwLjE0NiA0MDcwLjY0MyBMNzA4My4zOTUgNDA3MC40NzQgTDY4NzMuMTgzIDQwNzAuMTA2IEw2ODEyLjcxNCA0MDcwIEw0NjY5Ljg5IDQwNjYuMjU2IEw0NjM0LjkwMiA0MDY2LjE5NCBMNDEwNC45OSA0MDY1LjI2OCBMNDYzNS45NzIgNDA2NC41OTEgTDQ2NzEuMDMgNDA2NC41NDYgTDQ4NTguMTMxIDQwNjQuMzA3IEw0NjcxLjAzMSA0MDY0LjU0NSBMNDYzNS45NzMgNDA2NC41ODkgTDQxMDMuMzY3IDQwNjUuMjY1IEw0MTQ4LjY2IDQwMTkuODYxIEw0Njc0LjcgMzQ5Mi41MiBMNDY5My44MzEgMzQ3My4zNDIgTDQ2OTMuMzY0IDM0NzEuMDA2IEw0Njg4Ljk5NCAzNDQ5LjEyOSBMNDYyOS4zOTUgMzE1MC43OTUgTDQ1NDguOTU1IDI3NDguMTM5IEw0NTM3LjE5NSAyNjg5LjI2OSBMNDI3Mi4zMjkgMTM2My40MjggTDQyNjAuMDg4IDEzMDIuMTU0IEw0MjE5LjE0NiAxMDk3LjIxMiBMNDE5OS42NzcgOTk5Ljc1NCBaIE00MTAzLjI1NCA0MDY1LjI3IEw0MTAxLjQwMyA0MDYzLjQxNSBMNDA5Ni44NjcgNDA1OC44NjggTDM2MzcuNzg2IDM1OTguNzA1IEwzNTkyLjE5MiAzNTUzLjAwMyBMMzUyOS41OTcgMzQ5MC4yNjEgTDM1MjIuNzk0IDM0OTEuNTkxIEwzMTkyLjA5MSAzNTU2LjI1NCBMMTQwNS4zMDEgMzkwNS42MjcgTDEzNDQuMDc5IDM5MTcuNTk4IEwxMTMxLjQzOSAzOTU5LjE3NiBMMTAzMy45OTIgMzk3OC4yMyBMNjI0LjYwNCA0MDU4LjI3OCBMMTAzMi42MTIgNDA1OS4wOTggTDEwMzIuNjEyIDQwNTkuMDk4IEwxMTI5LjM2MiA0MDU5LjI5MiBMMTEyOS4zNjIgNDA1OS4yOTIgTDEzNDAuMjUzIDQwNTkuNzE2IEwxMzQwLjI1MyA0MDU5LjcxNiBMMTQwMC43MjIgNDA1OS44MzggTDE0MDAuNzIyIDQwNTkuODM4IEwzMDcyLjAwNiA0MDYzLjE5NyBMMzA3Mi4wMDYgNDA2My4xOTcgTDMxNzIuMDczIDQwNjMuMzk5IEwzMTcyLjA3MyA0MDYzLjM5OSBMMzM0OS40NDUgNDA2My43NTUgTDM1MjcuNDk4IDQwNjQuMTEzIEwzNTI3LjQ5OCA0MDY0LjExMyBMNDA5NC4xNTQgNDA2NS4yNTIgTDQwOTQuMTU0IDQwNjUuMjUyIEw0MDk2Ljg1OSA0MDY1LjI1OCBMNDA5Ni44NTkgNDA2NS4yNTggTDQwOTkuNTU2IDQwNjUuMjYzIEw0MDk5LjU1NiA0MDY1LjI2MyBaIE0zODgxLjM0NiA2NzYxLjE5NCBMMzc2MC42MzUgNjE0OS4wMjkgTDM2MjkuMTYxIDYyMDMuNDE2IEwzNDAwLjcyOCA2MjkzLjk0NyBMMzE4OC44MzcgNjM3My45ODcgTDI5OTQuNzYyIDY0NDMuMjkgTDI4ODUuNTU2IDY0NzkuODg2IEwyODg1LjU1NiA2NDc5Ljg4NiBDMzE4OS4wNTIgNjYzMy42MjYgMzUyNS40MzUgNjczMS44NDkgMzg4MS4zNDYgNjc2MS4xOTQgWiBNMzkzNy4yMDEgNzA0NC40NSBMMzg5My40OTggNjgyMi44MiBDMzUwMi40NTIgNjc5My4wMTQgMzEzNC4xMzkgNjY4MS45MDkgMjgwNS40MjQgNjUwNi4zNzIgTDI2NTguMzc5IDY1NTIuMDMyIEwyNTE5LjQ4MiA2NTkxLjQzNCBMMjUxOS40ODIgNjU5MS40MzQgQzI5MzQuMTMgNjg1My4xNjcgMzQxNy44OSA3MDE1LjM2IDM5MzcuMjAxIDcwNDQuNDUgWiBNNDI2NS44MTQgMTA5OS4zMTIgTDQzMDYuOTI2IDEzMDUuMTA4IEw0MzA2LjkyNiAxMzA1LjEwOCBDNDc5NS45MzggMTM0MC4wNzkgNTI0OS43ODMgMTUwMi4xNTIgNTYzNS42MDYgMTc1OC40NyBMNTYzNS42MDYgMTc1OC40NyBDNTY0Ni4yOTkgMTc2NS41NzQgNTY1Ni45NCAxNzcyLjc1IDU2NjcuNTI3IDE3NzkuOTk4IEw1NjY3LjUyNyAxNzc5Ljk5OCBDNjM0Ny4zODkgMjI0NS4zOTcgNjgwOC45MzggMzAwNi4zODkgNjg2Ni45OTIgMzg3Ny43OTIgTDY4NjYuOTkyIDM4NzcuNzkyIEw3MDc5LjY3MiAzOTIxLjkzOCBDNzAzMi45NzkgMjk4Mi4zMSA2NTUwLjY0IDIxNTcuMzU1IDU4MzAuNDcyIDE2NDQuODg4IEM1ODIwLjY4MiAxNjM3LjkyMSA1ODEwLjg0NyAxNjMxLjAxMiA1ODAwLjk2OSAxNjI0LjE2MSBDNTM2MC44NjUgMTMxOC45MjcgNDgzNC40OTQgMTEyOS4zMjQgNDI2NS44MTQgMTA5OS4zMTIgWiBNMzk0My43NzIgMTA5OS40OCBDMjQyOC4wNDYgMTE4MS4wNjIgMTIxMy42MjUgMjM5Ni40MzEgMTEzMy41NCAzOTEyLjU1NCBMMTM0Ni45MTggMzg3MC44MzIgQzE0NDEuNjcyIDI1MDAuMjM0IDI1MzQuNzYgMTQwNC4zNzQgMzkwNC4xNTggMTMwNS4yNzcgWiBNNDMxOS4yMjMgMTM2Ni42NjUgTDQ1NzYuNDkgMjY1NC40NjUgTDQ1OTcuMTc5IDI2MzYuMTQgTDQ5MDMuNTYzIDIzNzAuNDMgTDUyMTcuNzQyIDIxMDMuNjU5IEw1NTI2LjE1NCAxODQ3LjM2NyBMNTU4Ni4zOCAxNzk4LjQ1MiBDNTIxNi44MzYgMTU1Ni42NTIgNDc4NC41MzggMTQwMi44MTEgNDMxOS4yMjMgMTM2Ni42NjUgWiBNMzg5Mi4zMTMgMTM2Ni44MTMgQzI1NjUuODc5IDE0NzAuNzg3IDE1MDguMTcxIDI1MzEuMTkyIDE0MDguNDE0IDM4NTguODA4IEwzMTY1LjA1MiAzNTE1LjMzIEwyNDEzLjQyNCAyMzc3Ljc1MSBMMzU1MC40NDkgMzE0Mi44NTIgWiBNNTYxOS4wNjggMTgyMC4xOCBMNTU1MC42NjcgMTg3Ni44OTggTDUyNDUuMjA5IDIxMzYuMDIyIEw0OTM0LjEwOSAyNDA1LjY2MyBMNDYzMC44MiAyNjc0LjEzMyBMNDU4OC4xMjkgMjcxMi43MjYgTDQ1ODguMTI5IDI3MTIuNzI2IEw0NjcwLjEzMiAzMTIzLjIwOSBMNTgxNi43ODEgMjM0Ni43MzUgTDUwNDcuNDg5IDM1MDAuMTI1IEw1MDQ3LjQ4OSAzNTAwLjEyNSBMNjgwNS40ODMgMzg2NS4wMjUgQzY3NDMuNDY1IDMwMTMuNjA4IDYyODcuNTExIDIyNzEuNTEgNTYxOS4wNjggMTgyMC4xOCBaIE01NzExLjQzIDI0NTIuMTcgTDQ3MzEuOTA2IDM0MzIuNDM0IEw0NzMxLjkwNiAzNDMyLjQzNCBMNDczMi4zNjIgMzQzNC43MTYgTDUwMTYuNzIxIDM0OTMuNzM5IFogTTI1MTkuNDk2IDI0ODQuMjUxIEwzNDg0LjI3MSAzNDUyLjkxMyBMMzQ5MS4wMjEgMzQ1MS41OTMgTDM1NDQuNDY0IDMxNzMuOTQ4IFogTTExMzIuNDQxIDQyMDkuMzQ0IEMxMTU5LjExNiA0Nzk3LjQxIDEzNTYuNDAzIDUzNDEuMDE4IDE2NzUuOTczIDU3OTEuODM3IEwxNjc1Ljk3MyA1NzkxLjgzNyBDMTY5NC43MDggNTgxOC4yNjcgMTcxMy44NjMgNTg0NC4zNzcgMTczMy40MjkgNTg3MC4xNTkgTDE3MzMuNDI5IDU4NzAuMTU5IEMxOTI5LjgxIDYxMjguOTMyIDIxNjcuNTQ4IDYzNTQuNTk2IDI0MzYuNzk4IDY1MzcuMzA1IEwyNDk4LjQxMiA2NTIyLjIyNCBMMjYzOC40NCA2NDgzLjgyMyBMMjcyMC41NTEgNjQ1OS4xMTEgQzIzNzYuMzY5IDYyNTkuNDQ5IDIwNzkuMTk0IDU5ODcuNzEzIDE4NDkuNjggNTY2NC41NTggQzE4MzAuODI0IDU2MzguMDA4IDE4MTIuNDIzIDU2MTEuMTEgMTc5NC40OTEgNTU4My44NzcgQzE1MzkuNzg1IDUxOTcuMDU1IDEzNzkuNTM4IDQ3NDIuNTE3IDEzNDYuNTggNDI1My4wOTEgWiBNNzA3OS45NSA0MjE2LjY1OSBMNjg2Ni40MTUgNDI1OS41NiBDNjc3MC45ODEgNTYyOS4yNDMgNTY3OC41MTggNjcyNC4yMSA0MzA5LjkxOSA2ODIzLjU2NiBMNDMwOS45MTkgNjgyMy41NjYgTDQyNjcuMDc1IDcwNDQuOTEyIEM1Nzg4LjcgNjk2My45NjkgNzAwNy4xMTkgNTc0MC40MjQgNzA3OS45NSA0MjE2LjY1OSBaIE0xNDA4LjA4NiA0MjY1LjY1NyBDMTQ0Mi4wODkgNDcyOC4yNzIgMTU5Mi4zOTggNTE1OC41NjQgMTgyOS44OSA1NTI3LjQxMSBMMTg5Mi42NTIgNTQzMi4yMzYgTDE5NzUuOTQ2IDUzMTQuNzc5IEwyMDcxLjIyOSA1MTg3LjUzNyBMMjE3Ny41NjIgNTA1Mi4xNTEgTDIyOTUuNjI3IDQ5MDguNDE1IEwyNDI3LjY1MSA0NzUzLjk0MiBMMjU3MS43NTggNDU5MS41NDMgTDI2MzkuODg5IDQ1MTcuMzA1IFogTTY4MDQuODg0IDQyNzEuOTIzIEw1MDM2LjU5NSA0NjI3LjE4OSBMNTAzNi41OTUgNDYyNy4xODkgTDU0ODUuNTggNTMxMS4zODIgTDU4MTEuMTIyIDUxNTcuODYzIEw2MDY1Ljc2NiA1MDM0LjMxMiBDNjA2Ni44NzMgNTAzMy43NzUgNjA2OC4xMDUgNTAzMy41NTEgNjA2OS4zMyA1MDMzLjY2NSBMNjA3Mi4yMjcgNTAzMy45MzUgQzYwNzcuMTQ5IDUwMzQuMzk0IDYwNzkuOTE0IDUwMzkuODI0IDYwNzcuMzkxIDUwNDQuMDc1IEw2MDc1LjkwNiA1MDQ2LjU3NiBDNjA3NS4yNzggNTA0Ny42MzQgNjA3NC4zNzIgNTA0OC40OTkgNjA3My4yODcgNTA0OS4wNzkgTDU4MjMuNDc2IDUxODIuNDU1IEw1NTA4LjQzIDUzNDYuMjAzIEw1NTA4LjQzIDUzNDYuMjAzIEw1Nzc0LjE1MyA1NzUxLjEzIEw1MzEyLjIxMiA1NDQzLjc1MyBMNTEyMy4zNzMgNTUzNS44MSBMNDc4MC40NTQgNTY5OC4yOTggTDQ1MDMuMDI4IDU4MjUuODk2IEw0NTAzLjAyOCA1ODI1Ljg5NiBMNDMyMS44MzIgNjc2Mi4wMiBDNTY0Ny4zMjIgNjY1Ny43NzQgNjcwNC4zMDYgNTU5OC40NDEgNjgwNC44ODQgNDI3MS45MjMgWiBNMjcyOC44MzEgNDUzNS40NzUgTDI2MzAuOTA2IDQ2NDQuMzc5IEwyNDg5LjM4NyA0ODA3LjE2IEwyMzU5Ljk0OCA0OTYxLjc2IEwyMjQ0LjQ0NiA1MTA1LjMyMiBMMjE0MC42NzUgNTI0MC4yNDUgTDIwNDcuOTYyIDUzNjYuNzExIEwxOTY3LjIzNSA1NDgzLjAzNCBMMTg5NC4yMDcgNTU5My4yNiBMMTg4NC40NTMgNTYwOC44NzggTDE4ODQuNDUzIDU2MDguODc4IEMyMTIxLjc0MSA1OTQ5LjY2OCAyNDM1LjQxMiA2MjMzLjI5OSAyODAwLjY2NCA2NDM0Ljk2NiBMMjk3Mi44MDkgNjM3OC45NSBMMzE2Ni4yODUgNjMxMS43NjQgTDMzNzcuODE3IDYyMzMuOTY4IEwzNjA2LjExOCA2MTQ1Ljc5MiBMMzc0OC42NTcgNjA4OC4yODMgTDM1MzYuMTU2IDUwMTAuNjI3IEwyMzU5Ljg3NyA1ODA1LjM5IEwyMzYwLjAzMyA1ODA1LjIzNCBMMjM1OS44NDkgNTgwNS4zNjEgTDMxNTMuMjY2IDQ2MjIuMTg0IFogTTMxODQuMTI1IDQ2MjguNDg4IEwyNDY2LjI4NyA1Njk4Ljk1NyBMMjQ3My4xOTQgNTY5Mi4wNTEgTDM0NzMuMjgxIDQ2OTEuNzY2IEwzNDcyLjQ5IDQ2ODcuNzUyIEwzNDcyLjQxNyA0Njg3LjM4NCBaIE00NzIxLjg5IDQ2OTUuMTgzIEw0NjY2Ljg4NyA0OTc5LjM0OCBMNDY2Ni44ODcgNDk3OS4zNDggTDUyOTguMzI0IDUzOTkuNTA5IEw1Mjk4LjMyNCA1Mzk5LjUwOSBMNTM0Mi41NzMgNTQyOC45NTIgTDUzNDIuNTczIDU0MjguOTUyIEw1NjY5LjI4IDU2NDYuMzQ1IEw1NjY4LjM2NSA1NjQ0Ljk3MiBMNTQxNi45NjIgNTM5Mi42ODggTDUzODMuMzYyIDUzNTguOTcxIFogTTYyMzguMTM4IDQ4OTQuNTE1IEM2Mjc0Ljk0NyA0ODcwLjM5IDYzMDcuODE3IDQ3NjQuODQgNjMyMS45MjkgNDc2OC45MjkgQzYzMzYuMDQyIDQ3NzMuMDE3IDYzMDcuMzk1IDQ4NzkuNzkxIDYzMjUuNjA3IDQ5MTkuODU3IEM2MzI3LjEwNyA0OTIzLjE1OCA2MzI3LjY3NSA0OTI1LjE4OSA2MzI5LjA1IDQ5MjcuNjg2IEM2MzMwLjQyNSA0OTMwLjE4MyA2MzMxLjgzOCA0OTMxLjc0OSA2MzMzLjgyNiA0OTM0Ljc4MSBDNjM1Ny45NTEgNDk3MS41OTEgNjQ2My41MDEgNTAwNC40NiA2NDU5LjQxMiA1MDE4LjU3MyBDNjQ1NS4zMjQgNTAzMi42ODUgNjM0OC41NSA1MDA0LjAzOSA2MzA4LjQ4NCA1MDIyLjI1IEM2MzA1LjE4MyA1MDIzLjc1MSA2MzAzLjE1MiA1MDI0LjMxOCA2MzAwLjY1NSA1MDI1LjY5MyBDNjI5OC4xNTggNTAyNy4wNjkgNjI5Ni41OTIgNTAyOC40ODEgNjI5My41NiA1MDMwLjQ2OSBDNjI1Ni43NSA1MDU0LjU5NCA2MjIzLjg4MSA1MTYwLjE0NCA2MjA5Ljc2OCA1MTU2LjA1NiBDNjE5NS42NTYgNTE1MS45NjcgNjIyNC4zMDIgNTA0NS4xOTMgNjIwNi4wOTEgNTAwNS4xMjcgQzYyMDQuNTkgNTAwMS44MjYgNjIwNC4wMjMgNDk5OS43OTUgNjIwMi42NDggNDk5Ny4yOTggQzYyMDEuMjcyIDQ5OTQuODAxIDYxOTkuODU5IDQ5OTMuMjM2IDYxOTcuODcyIDQ5OTAuMjAzIEM2MTczLjc0NyA0OTUzLjM5NCA2MDY4LjE5NyA0OTIwLjUyNCA2MDcyLjI4NSA0OTA2LjQxMSBDNjA3Ni4zNzQgNDg5Mi4yOTkgNjE4My4xNDggNDkyMC45NDUgNjIyMy4yMTQgNDkwMi43MzQgQzYyMjYuNTE1IDQ5MDEuMjM0IDYyMjguNTQ2IDQ5MDAuNjY2IDYyMzEuMDQzIDQ4OTkuMjkxIEM2MjMzLjU0IDQ4OTcuOTE2IDYyMzUuMTA1IDQ4OTYuNTAzIDYyMzguMTM4IDQ4OTQuNTE1IFogTTQ2NjAuODg0IDUwMTAuMzU3IEw0NTE1LjUxOSA1NzYxLjM2NiBMNDc1OS4wNTIgNTY1MS45MjggTDUxMDIuODc1IDU0OTIuNjggTDUyNjcuNjc2IDU0MTQuMTE5IFogTTE2ODYuOTE3IDU5NjguMjUxIEwxNjYxLjcyMiA2MDI3LjM2MiBMMTYzNi4xMTQgNjA5Ni41NzEgQzE2MzYuMDczIDYwOTYuNjg0IDE2MzYuMDM0IDYwOTYuNzk3IDE2MzUuOTk4IDYwOTYuOTEyIEwxNjE2LjU5MSA2MTU5LjQ0NSBDMTYxNi41NSA2MTU5LjU3NSAxNjE2LjUxNCA2MTU5LjcwNyAxNjE2LjQ4MSA2MTU5LjgzOSBMMTYwMi4zNzQgNjIxNy40NTcgQzE2MDIuMzM5IDYyMTcuNiAxNjAyLjMwOSA2MjE3Ljc0NCAxNjAyLjI4MyA2MjE3Ljg5IEwxNTkyLjg1NSA2MjcxLjQxOSBDMTU5Mi44MjcgNjI3MS41NzUgMTU5Mi44MDUgNjI3MS43MzMgMTU5Mi43ODkgNjI3MS44OTEgTDE1ODcuNjQ0IDYzMjEuMzg5IEMxNTg3LjYyNiA2MzIxLjU2NiAxNTg3LjYxNCA2MzIxLjc0NSAxNTg3LjYxIDYzMjEuOTI0IEwxNTg2LjU0MyA2MzY2LjUyOCBDMTU4Ni41MzggNjM2Ni43MjQgMTU4Ni41NDIgNjM2Ni45MjEgMTU4Ni41NTUgNjM2Ny4xMTcgTDE1ODkuMTc3IDY0MDguMzM5IEMxNTg5LjE5IDY0MDguNTQ3IDE1ODkuMjEzIDY0MDguNzU0IDE1ODkuMjQ1IDY0MDguOTYgTDE1OTUuMjc1IDY0NDcuMjI5IEMxNTk1LjMwOSA2NDQ3LjQ0NSAxNTk1LjM1MyA2NDQ3LjY1OCAxNTk1LjQwOCA2NDQ3Ljg2OSBMMTYwNC40ODMgNjQ4Mi45MDggQzE2MDQuNTU1IDY0ODMuMTg4IDE2MDQuNjQ2IDY0ODMuNDYzIDE2MDQuNzU0IDY0ODMuNzMxIEwxNjEzLjExMyA2NTA0LjUxOSBDMTYxMy4yMzcgNjUwNC44MjggMTYxMy4zODQgNjUwNS4xMjcgMTYxMy41NTIgNjUwNS40MTQgTDE2MjQuMDQ3IDY1MjMuMzAyIEMxNjI0LjIxOSA2NTIzLjU5NyAxNjI0LjQxNCA2NTIzLjg3OCAxNjI0LjYyOSA2NTI0LjE0MiBMMTYzNy41NyA2NTQwLjA2MiBDMTYzNy43ODQgNjU0MC4zMjQgMTYzOC4wMTYgNjU0MC41NyAxNjM4LjI2NyA2NTQwLjc5OCBMMTY1NC4yMyA2NTU1LjMwNiBDMTY1NC40NjMgNjU1NS41MTggMTY1NC43MTEgNjU1NS43MTMgMTY1NC45NzEgNjU1NS44OSBMMTY3NS40NDYgNjU2OS44MTUgQzE2NzUuNjc5IDY1NjkuOTc0IDE2NzUuOTIxIDY1NzAuMTE3IDE2NzYuMTcyIDY1NzAuMjQ1IEwxNzAxLjA4MyA2NTgyLjk1NSBDMTcwMS4zMTMgNjU4My4wNzMgMTcwMS41NSA2NTgzLjE3NyAxNzAxLjc5MiA2NTgzLjI2NyBMMTczMS42ODIgNjU5NC40MDQgQzE3MzEuOTAxIDY1OTQuNDg1IDE3MzIuMTIzIDY1OTQuNTU1IDE3MzIuMzQ5IDY1OTQuNjE0IEwxNzY4LjMxOCA2NjAzLjkwNSBDMTc2OC41MDkgNjYwMy45NTQgMTc2OC43MDEgNjYwMy45OTUgMTc2OC44OTUgNjYwNC4wMjcgTDE4MTIuMjI3IDY2MTEuMjQ3IEMxODEyLjM5NyA2NjExLjI3NSAxODEyLjU2NyA2NjExLjI5NyAxODEyLjczOCA2NjExLjMxMiBMMTg2Mi44MjkgNjYxNS43NjMgQzE4NjIuOTgyIDY2MTUuNzc2IDE4NjMuMTM0IDY2MTUuNzg1IDE4NjMuMjg4IDY2MTUuNzg4IEwxOTIwLjg4NSA2NjE2Ljk2MiBDMTkyMS4wMTYgNjYxNi45NjUgMTkyMS4xNDggNjYxNi45NjQgMTkyMS4yNzkgNjYxNi45NTkgTDE5OTAuMTM3IDY2MTQuMzI1IEwyMDY3LjU2MyA2NjA3LjQwOCBMMjE1NS44NjEgNjU5NS40MjIgTDIyNTcuMzE4IDY1NzcuNjAxIEwyMzA5Ljc0OCA2NTY2LjQ3NyBDMjA3NS4xMjUgNjM5Ny4xODcgMTg2NS4zNDQgNjE5NS42MDcgMTY4Ni45MTcgNTk2OC4yNTEgWiIgY2xhc3M9ImNscy0yIi8+PC9nPjwvZz48L3N2Zz4=">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Marcellus&display=swap" rel="stylesheet">
<script>try{const t=localStorage.getItem("pmTheme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}
/* inside the EFB's Admin app: tell the EFB the admin opened (it shows Sign in otherwise) */
if(window.parent!==window){document.documentElement.classList.add("in-efb");try{parent.postMessage({pmAdmin:1},"*")}catch(e){}
 /* the EFB's day or night (Nov 2026): given with the address when the EFB opens the admin (&theme=) and sent again when it
    changes, so the EFB's own top bar and the admin match; the admin's own Light/Auto/Dark buttons go while it does */
 /* and the colour of its top bar, so the EFB colours the strips above it the same (after the .25s colour change) */
 let topT=0;const topSend=()=>{clearTimeout(topT);topT=setTimeout(()=>{try{const h=document.querySelector("header");if(h)parent.postMessage({pmTop:getComputedStyle(h).backgroundColor},"*")}catch(e){}},320)};
 const efbThm=t=>{if(t!=="dark"&&t!=="light"&&t!=="auto")return;const R=document.documentElement;R.classList.add("efb-thm");if(t==="auto")delete R.dataset.theme;else R.dataset.theme=t;topSend()};
 try{efbThm(new URLSearchParams(location.search).get("theme"))}catch(e){}
 window.addEventListener("message",e=>{if(e.source!==window.parent||!/^https:\\/\\/(www\\.)?koz8738\\.com$/.test(e.origin)||!e.data||typeof e.data.pmTheme!=="string")return;efbThm(e.data.pmTheme)});
 /* the EFB's Calendar opens a task here (pmGo: { task }) */
 window.addEventListener("message",e=>{if(e.source!==window.parent||!/^https:\\/\\/(www\\.)?koz8738\\.com$/.test(e.origin)||!e.data||!e.data.pmGo)return;const id=String(e.data.pmGo.task||"").replace(/[^a-z0-9]/gi,"").slice(0,24);
  if(location.hash!=="#tasks")location.hash="#tasks";if(id){const go=n=>{if(typeof tkOpen==="function")tkOpen(id);else if(n<20)setTimeout(()=>go(n+1),150)};setTimeout(()=>go(0),200)}});
 document.addEventListener("DOMContentLoaded",topSend);document.addEventListener("click",e=>{if(e.target.closest&&e.target.closest("[data-thm]"))topSend()});
 try{matchMedia("(prefers-color-scheme: dark)").addEventListener("change",topSend)}catch(e){}}</script>
<style>
:root{color-scheme:light;--teal:#1A6772;--teal-d:#124C55;--accent:#1A6772;--mist:#E3E9E9;--bronze:#A78970;--ink:#0F2A2E;--label:#51696C;--line:#D5DEDE;--bg:#FFFFFF;--soft:#F5F8F8;--field:#FFFFFF;--off:#9aa8aa;--red:#B42828;--red-l:#e6c4c4;--green:#2C7A4B;--ok-bg:#E6F0E9;--err-bg:#F6E5E5;--q-bg:#F4ECE3;--q:#8A6744}
:root[data-theme=dark]{--logo:#8FCBD0;--logo2:#C2A88F;color-scheme:dark;--teal:#1A6772;--teal-d:#22808D;--accent:#7CC2C9;--mist:#222225;--bronze:#A78970;--ink:#E8E8E9;--label:#9C9CA1;--line:#2E2E32;--bg:#1A1A1C;--soft:#121213;--field:#222225;--off:#5C5C61;--red:#F2A3A3;--red-l:#4A2427;--green:#8FCFA6;--ok-bg:#1D2A23;--err-bg:#3A1C1E;--q-bg:#2E2A24;--q:#D9C2AD}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--logo:#8FCBD0;--logo2:#C2A88F;color-scheme:dark;--teal:#1A6772;--teal-d:#22808D;--accent:#7CC2C9;--mist:#222225;--bronze:#A78970;--ink:#E8E8E9;--label:#9C9CA1;--line:#2E2E32;--bg:#1A1A1C;--soft:#121213;--field:#222225;--off:#5C5C61;--red:#F2A3A3;--red-l:#4A2427;--green:#8FCFA6;--ok-bg:#1D2A23;--err-bg:#3A1C1E;--q-bg:#2E2A24;--q:#D9C2AD}}
body,header,section,input,select,textarea,button,.preview{transition:background-color .25s,border-color .25s,color .25s}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--soft);color:var(--ink);font:15px/1.5 Jost,"Avenir Next","Segoe UI",system-ui,sans-serif}
header{background:var(--bg);border-bottom:1px solid var(--line);padding:0 24px;height:var(--hdr);display:flex;align-items:center;gap:14px}
header h1{font:400 22px Marcellus,Georgia,serif;margin:0;color:var(--accent)}
.brand{display:flex;align-items:center;gap:14px}.brand .logo{height:30px;width:auto;aspect-ratio:15092/3905;display:block;flex:none}.logo .lg1{fill:var(--logo,#1A6770)}.logo .lg2{fill:var(--logo2,#A78970)}.brand span{font:400 21px Marcellus,Georgia,serif;color:var(--bronze);padding-left:14px;border-left:1px solid var(--line);line-height:26px;letter-spacing:.02em}
@media(max-width:520px){.brand .logo{height:24px}.brand span{font-size:18px}}header .who{margin-left:auto;color:var(--label);font-size:13px}
main{max-width:1180px;margin:0 auto;padding:24px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:24px}
@media(max-width:900px){main{grid-template-columns:1fr}}
section{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:20px}
h2{font:500 13px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--bronze);margin:0 0 14px}
label{display:block;font-weight:500;font-size:13px;color:var(--label);margin:14px 0 6px}
input[type=text],input[type=email],input[type=datetime-local],select,textarea{width:100%;font:inherit;color:var(--ink);background:var(--field);border:1px solid var(--line);border-radius:4px;padding:9px 11px}
input[type=file]{font:inherit;font-size:13.5px;color:var(--label)}input[type=file]::file-selector-button{font:500 13px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;border-radius:4px;border:1px solid var(--line);background:var(--field);color:var(--ink);padding:6px 12px;margin-right:10px;cursor:pointer}
::placeholder{color:var(--off)}
textarea{min-height:220px;resize:vertical;font-size:14.5px}input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:var(--accent)}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.row>*{flex:1}
.radio{display:flex;gap:18px;flex-wrap:wrap;margin-top:4px}.radio label{display:flex;gap:7px;align-items:center;margin:0;font-weight:400;color:var(--ink)}
.radio label.off{color:var(--off)}
.hint{color:var(--label);font-size:12.5px;margin:6px 0 0}
button{font:500 14px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;border-radius:4px;border:1px solid var(--line);background:var(--field);color:var(--ink);padding:9px 16px;cursor:pointer}
button.primary{background:var(--teal);border-color:var(--teal);color:#fff}button.primary:hover{background:var(--teal-d)}
button.warn{color:var(--red);border-color:var(--red-l)}button:disabled{opacity:.5;cursor:default}
.actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
.preview{border:1px dashed var(--line);border-radius:4px;padding:14px 16px;margin-top:8px;background:var(--soft);min-height:60px}
.preview h4{margin:12px 0 4px;font-size:15px}.preview p{margin:0 0 10px}.preview ul{margin:0 0 10px;padding-left:20px}
.atts{list-style:none;padding:0;margin:8px 0 0}.atts li{display:flex;gap:10px;align-items:center;font-size:13.5px;padding:4px 0}.atts button{padding:2px 9px;font-size:12px}
.mail{border-top:1px solid var(--line);padding:12px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px}
.mail:first-of-type{border-top:0}.mail b{font-weight:600}.mail .meta{color:var(--label);font-size:12.5px}
.mail .btns{grid-row:1/3;grid-column:2;display:flex;gap:6px;align-items:start}.mail .btns button{padding:4px 10px;font-size:12.5px}
.tag{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.05em;padding:1px 7px;border-radius:9px;margin-left:6px;vertical-align:1px}
.tag.s{background:var(--ok-bg);color:var(--green)}.tag.d{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.to-one{margin-top:4px;padding:2px 14px 12px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:4px;background:var(--soft)}.to-one input#toPilot{text-transform:uppercase}
.lv-dbtn button.msg{background:var(--teal);border-color:var(--teal);color:#fff;display:inline-flex;align-items:center;gap:6px}.lv-dbtn button.msg svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8}.lv-dbtn button.msg:disabled{opacity:.45}
.lv-dbtn button.aoc{display:inline-flex;align-items:center;gap:6px}.lv-dbtn button.aoc svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8}.lv-dbtn button.aoc:disabled{opacity:.45}
.tag.q{background:var(--q-bg);color:var(--q)}
.msg{margin-top:12px;padding:10px 12px;border-radius:4px;font-size:14px}.msg.ok{background:var(--ok-bg);color:var(--green)}.msg.err{background:var(--err-bg);color:var(--red)}
.deny{max-width:640px;margin:60px auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:24px;font-size:15px}
.empty{color:var(--label);font-size:14px}

/* ---------- Pilots tab ---------- */
main#pilots{display:block;max-width:1180px}main#pilots[hidden]{display:none!important}
.pl-h{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px}.pl-h h2{margin-bottom:4px}.pl-h input{max-width:300px;width:100%;font:inherit;color:var(--ink);background:var(--field);border:1px solid var(--line);border-radius:4px;padding:8px 11px}
.pl-wrap{overflow-x:auto}.pl-t{width:100%;border-collapse:collapse;font-size:14px}.pl-t th{text-align:left;font-weight:600;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--label);padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.pl-t td{padding:10px;border-bottom:1px solid var(--line);vertical-align:middle;white-space:nowrap}.pl-t td.pl-p b{font:600 14px "IBM Plex Mono",ui-monospace,Consolas,monospace;margin-right:8px}.pl-t td.pl-p span{color:var(--label)}
.pl-t td.pl-x{text-align:right}.pl-t td.pl-x button{padding:4px 10px;font-size:12.5px;margin-left:6px}.pl-t tr.off td{color:var(--label)}
.pl-s{display:inline-block;font-size:11.5px;font-weight:600;letter-spacing:.03em;border-radius:9px;padding:2px 8px}.pl-s.on{background:var(--ok-bg);color:var(--green)}.pl-s.was{background:var(--soft);color:var(--label);border:1px solid var(--line)}.pl-s.no{color:var(--label)}
.lv-n{font:600 10.5px/1 Jost,system-ui,sans-serif;background:var(--teal);color:#fff;border-radius:9px;padding:3px 6px}
/* ---------- Live tab ---------- */
#live{--g-bg:#EEF3F3;--g-sphere:#DCE7E8;--g-land:#FFFFFF;--g-edge:#B9CBCD;--g-grat:rgba(26,103,114,.10);--g-rim:rgba(26,103,114,.25);--g-glow:rgba(26,103,114,.14);--g-route:#A78970;--g-plane:#1A6772;--g-trail:rgba(26,103,114,.35);--g-label:#0F2A2E;--g-ground:#EEF3F2;--g-apron:#D8E0E1;--g-twy:#C4CFD1;--g-rwy:#6F7D81;--g-rwy-mark:#FFFFFF;--g-rwy-tag:#1D1F22;--g-cl:#D4A21E;--g-twy-tag:#F2C230;--g-bldg:#B5C2C5;--g-stand:#51696C;
 --p-gate:#7A8A8C;--p-taxi:#A78970;--p-to:#2E8B97;--p-cr:#1A6772;--p-de:#B7791F;--p-arr:#2C7A4B}
:root[data-theme=dark] #live{--g-bg:#0B0D10;--g-sphere:#12171C;--g-land:#1F262D;--g-edge:#323C46;--g-grat:rgba(255,255,255,.045);--g-rim:rgba(255,255,255,.08);--g-glow:rgba(124,194,201,.13);--g-route:#E2C08C;--g-plane:#C9B39F;--g-trail:rgba(201,179,159,.3);--g-label:rgba(255,255,255,.75);--g-ground:#181D23;--g-apron:#2B343D;--g-twy:#3B4752;--g-rwy:#6B7783;--g-rwy-mark:rgba(255,255,255,.82);--g-rwy-tag:#0E1013;--g-cl:#C9A13A;--g-twy-tag:#E9BC2F;--g-bldg:#36424D;--g-stand:#9AA7AE;
 --p-gate:#8E8E94;--p-taxi:#D9C2AD;--p-to:#7CC2C9;--p-cr:#9AD6DC;--p-de:#E8B86A;--p-arr:#8FCFA6}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]) #live{--g-bg:#0B0D10;--g-sphere:#12171C;--g-land:#1F262D;--g-edge:#323C46;--g-grat:rgba(255,255,255,.045);--g-rim:rgba(255,255,255,.08);--g-glow:rgba(124,194,201,.13);--g-route:#E2C08C;--g-plane:#C9B39F;--g-trail:rgba(201,179,159,.3);--g-label:rgba(255,255,255,.75);--g-ground:#181D23;--g-apron:#2B343D;--g-twy:#3B4752;--g-rwy:#6B7783;--g-rwy-mark:rgba(255,255,255,.82);--g-rwy-tag:#0E1013;--g-cl:#C9A13A;--g-twy-tag:#E9BC2F;--g-bldg:#36424D;--g-stand:#9AA7AE;
 --p-gate:#8E8E94;--p-taxi:#D9C2AD;--p-to:#7CC2C9;--p-cr:#9AD6DC;--p-de:#E8B86A;--p-arr:#8FCFA6}}
main#live{max-width:none;margin:0;padding:0;gap:0;display:grid}
main#live[hidden]{display:none!important}
.lv-stage{position:relative;background:var(--g-bg);overflow:hidden;min-height:0}
#lvGlobe{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}#lvGlobe.dragging{cursor:grabbing}#lvGlobe.over-plane{cursor:pointer}
.lv-ctl{position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg)}
.lv-ctl button{border:0;border-radius:0;background:transparent;width:38px;height:38px;padding:0;display:grid;place-items:center;font-size:18px;color:var(--ink)}
.lv-ctl button+button{border-top:1px solid var(--line)}.lv-ctl svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7}
.lv-src{position:absolute;left:16px;bottom:16px;font-size:12.5px;color:var(--label);background:color-mix(in srgb,var(--bg) 88%,transparent);border:1px solid var(--line);border-radius:6px;padding:6px 10px;display:flex;align-items:center;gap:7px;max-width:calc(100% - 90px)}
.lv-dot{width:7px;height:7px;border-radius:50%;background:#3FB27F;box-shadow:0 0 0 0 rgba(63,178,127,.6);animation:lvPulse 2s infinite}
@keyframes lvPulse{70%{box-shadow:0 0 0 7px rgba(63,178,127,0)}100%{box-shadow:0 0 0 0 rgba(63,178,127,0)}}
.lv-err{color:var(--red)}.lv-link{border:0;background:none;padding:0;color:var(--accent);font-size:12.5px;text-decoration:underline}
.lv-tag{display:inline-block;font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.06em;color:var(--q);background:var(--q-bg);border-radius:9px;padding:1px 7px;margin-left:7px;vertical-align:2px}
.lv-src .lv-tag{margin:0}
.lv-side{border-left:1px solid var(--line);background:var(--bg);display:flex;flex-direction:column;min-height:0;overflow:auto}
.lv-sum{display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--line)}
.lv-c{padding:12px 2px 10px;text-align:center;border-top:3px solid var(--pc,var(--line))}
.lv-c b{display:block;font:400 22px/1.1 Marcellus,Georgia,serif;color:var(--ink)}.lv-c span{display:block;font-size:10.5px;color:var(--label);margin-top:3px;letter-spacing:.02em}
.lv-c.z{opacity:.45}
.ph-gate{--pc:var(--p-gate)}.ph-taxiout,.ph-taxiin{--pc:var(--p-taxi)}.ph-takeoff{--pc:var(--p-to)}.ph-cruise{--pc:var(--p-cr)}.ph-descent{--pc:var(--p-de)}.ph-arrived{--pc:var(--p-arr)}
.lv-list{display:flex;flex-direction:column;padding:6px 0}
.lv-f{display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"cs rt ph" "cs al ph";gap:1px 12px;align-items:center;text-align:left;border:0;border-radius:0;background:transparent;padding:10px 18px;border-left:3px solid transparent}
.lv-f:hover{background:var(--soft)}.lv-f.on{background:var(--soft);border-left-color:var(--accent)}
.lv-cs{grid-area:cs;font:600 14.5px "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--ink)}
.lv-rt{grid-area:rt;font-size:13.5px;color:var(--ink)}.lv-rt i{font-style:normal;color:var(--label);margin:0 2px}.lv-rt em{font-style:normal;color:var(--label);font-size:12px;margin-left:8px}
.lv-al{grid-area:al;font-size:12px;color:var(--label)}
.lv-ph{grid-area:ph;font:600 11px Jost,system-ui,sans-serif;letter-spacing:.03em;color:var(--pc);border:1px solid color-mix(in srgb,var(--pc) 45%,transparent);background:color-mix(in srgb,var(--pc) 12%,transparent);border-radius:10px;padding:2px 9px;white-space:nowrap}
.lv-empty{padding:28px 22px;color:var(--label);font-size:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}.lv-empty b{color:var(--ink);font-weight:500}.lv-empty button{margin-top:6px}
.lv-det{border-top:1px solid var(--line);padding:16px 18px 20px;margin-top:auto;background:var(--bg)}
.lv-dh{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.lv-dh b{font:600 18px "IBM Plex Mono",ui-monospace,Consolas,monospace}.lv-dh small{display:block;color:var(--label);font-size:12.5px;margin-top:2px}
.lv-dbtn{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;flex:0 1 auto;max-width:58%}.lv-dh>div:first-child{min-width:0}.lv-dbtn button{padding:0 10px;font-size:12.5px;height:28px;line-height:1;display:inline-flex;align-items:center;margin:0}.lv-dbtn button[aria-pressed=true]{background:var(--teal);border-color:var(--teal);color:#fff}
.lv-od{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;margin-top:14px}
.lv-od b{font:400 22px Marcellus,Georgia,serif;display:block}.lv-od small{color:var(--label);font-size:11.5px}.lv-od .r{text-align:right}
.lv-bar{position:relative;height:2px;background:var(--line);border-radius:2px}.lv-bar span{position:absolute;left:0;top:0;bottom:0;background:var(--bronze);border-radius:2px;transition:width .6s}
.lv-bar i{position:absolute;top:50%;width:18px;height:18px;transform:translate(-50%,-50%) rotate(90deg);transition:left .6s;display:block}.lv-bar i svg{width:100%;height:100%;fill:var(--bronze);display:block}
.lv-dist{font-size:12px;color:var(--label);margin-top:8px}
.lv-steps{list-style:none;padding:0;margin:16px 0 4px;display:grid;grid-template-columns:repeat(7,1fr);position:relative}
.lv-steps li{display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;font-size:10.5px;color:var(--label);text-align:center}
.lv-steps li::before{content:"";position:absolute;top:5px;left:-50%;right:50%;height:2px;background:var(--line)}.lv-steps li:first-child::before{display:none}
.lv-steps li.done::before,.lv-steps li.now::before{background:var(--accent)}
.lv-steps span{width:12px;height:12px;border-radius:50%;border:2px solid var(--line);background:var(--bg);position:relative;z-index:1}
.lv-steps li.done span{background:var(--accent);border-color:var(--accent)}
.lv-steps li.now span{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 25%,transparent);background:var(--accent);animation:lvNow 1.6s ease-in-out infinite}
@keyframes lvNow{50%{box-shadow:0 0 0 7px color-mix(in srgb,var(--accent) 10%,transparent)}}
.lv-steps b{font-weight:500}.lv-steps li.now b{color:var(--ink);font-weight:600}
.lv-kv{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin:16px 0 0}.lv-kv dt{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--label)}.lv-kv dd{margin:2px 0 0;font:500 14px "IBM Plex Mono",ui-monospace,Consolas,monospace}
.lv-srcb{display:inline-block;margin-top:6px;white-space:nowrap;font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.04em;border-radius:9px;padding:2px 8px}.lv-srcb.va{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}.lv-srcb.vs{color:var(--label);background:var(--soft);border:1px solid var(--line)}
.lv-acars{font-size:12px;color:var(--label);margin-top:12px}.lv-acars b{color:var(--ink);font-weight:600}
.lv-route{margin-top:14px;font-size:13px}.lv-route summary{cursor:pointer;color:var(--accent)}.lv-route p{font:12.5px/1.6 "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--label);margin:8px 0 0;word-break:break-word}
@media(max-width:900px){main#live{grid-template-rows:56vh auto}.lv-side{border-left:0;border-top:1px solid var(--line);overflow:visible}.who{display:none}}
@media(prefers-reduced-motion:reduce){.lv-dot,.lv-steps li.now span{animation:none}}
@media(max-width:560px){header{padding:0 12px;gap:10px}.brand{gap:0}.brand span{display:none}.brand .logo{height:22px}.thm button{padding:5px 6px}}

.preview a{color:var(--accent)}
.thm{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}.thm button{border:0;border-radius:0;background:transparent;color:var(--label);padding:5px 9px;display:grid;place-items:center}.thm button+button{border-left:1px solid var(--line)}.thm button[aria-pressed=true]{background:var(--soft);color:var(--accent)}.thm svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
/* ---------- Inbox tab ---------- */
main#inbox{max-width:1180px;grid-template-columns:minmax(0,380px) minmax(0,1fr)}main#inbox[hidden]{display:none!important}
.ib-side{padding:0;display:flex;flex-direction:column;min-height:0}.ib-h{padding:16px 18px 10px;border-bottom:1px solid var(--line)}.ib-h h2{margin-bottom:10px}
.ib-f{display:flex;gap:8px}.ib-f select{flex:1;padding:6px 8px;font-size:13.5px}
.ib-seg{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}.ib-seg button{border:0;border-radius:0;padding:6px 12px;font-size:13px;background:transparent;color:var(--label)}.ib-seg button+button{border-left:1px solid var(--line)}.ib-seg button[aria-pressed=true]{background:var(--teal);color:#fff}
.ib-list{overflow:auto;max-height:calc(100vh - 230px)}
.ib-t{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;padding:12px 18px;border-left:3px solid transparent}
.ib-t:hover{background:var(--soft)}.ib-t.on{background:var(--soft);border-left-color:var(--accent)}
.ib-t b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ib-t.new b{font-weight:700}.ib-t .meta{color:var(--label);font-size:12.5px;grid-column:1/3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ib-t time{color:var(--label);font-size:12px}.ib-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-right:7px;vertical-align:1px}
.ib-w{font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.05em;color:#B7791F;margin-left:6px}
.ib-view,.ib-ms{display:flex;flex-direction:column;gap:14px}.ib-vh{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.ib-vh h3{margin:0;font:400 21px Marcellus,Georgia,serif}.ib-vh .meta{color:var(--label);font-size:13px;margin-top:3px}
.ib-m{border:1px solid var(--line);border-radius:8px;padding:12px 14px;max-width:86%;background:var(--soft)}.ib-m.st{margin-left:auto;background:color-mix(in srgb,var(--accent) 10%,var(--bg));border-color:color-mix(in srgb,var(--accent) 35%,var(--line))}
.ib-m .who{font-size:12.5px;color:var(--label);margin-bottom:6px}.ib-m .who b{color:var(--ink);font-weight:600}.ib-m p{margin:0;white-space:pre-wrap;word-break:break-word}
.ib-m a{color:var(--accent)}.ib-r textarea{min-height:120px}.ib-note{color:var(--label);font-size:12.5px}
@media(max-width:900px){main#inbox{grid-template-columns:1fr}.ib-list{max-height:none}}
/* ---------- Documents tab ---------- */
main#docs{grid-template-columns:minmax(0,1fr) minmax(0,1.25fr)}main#docs[hidden]{display:none!important}
.dc-pre{display:flex;gap:14px;align-items:center;margin-top:10px;padding:10px 12px;border:1px dashed var(--line);border-radius:4px;background:var(--soft)}
.dc-pre img{width:60px;aspect-ratio:8.5/11;object-fit:cover;object-position:top;background:#fff;border:1px solid var(--line);border-radius:2px;flex:none}
.dc-pre img:not([src]){visibility:hidden}.dc-pre b{font-weight:600;word-break:break-word}.dc-pre .hint{margin:2px 0 0}
.dc-prog{height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin-top:16px}.dc-prog span{display:block;height:100%;width:0;background:var(--teal);transition:width .2s}
.dc-f{margin:18px 0 2px;font:500 12px Jost,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--bronze)}.dc-f:first-child{margin-top:4px}
.dc-d{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:3px 14px;align-items:start;padding:12px 6px;border-top:1px solid var(--line);border-radius:4px}
.dc-d.on{background:color-mix(in srgb,var(--accent) 9%,transparent)}
.dc-c{grid-row:1/3;width:52px;aspect-ratio:8.5/11;background:#fff;border:1px solid var(--line);border-radius:2px;overflow:hidden;display:grid;place-items:center;color:#8a9799;font:600 10px Jost,system-ui,sans-serif}
.dc-c img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.dc-d b{font-weight:600}.dc-d .meta{color:var(--label);font-size:12.5px;grid-column:2}
.dc-d .btns{grid-row:1/3;grid-column:3;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:270px}
.dc-d .btns button{padding:4px 10px;font-size:12.5px}
.btnl{font:500 12.5px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;border-radius:4px;border:1px solid var(--line);background:var(--field);color:var(--ink);text-decoration:none;display:inline-flex;align-items:center;padding:4px 10px}
@media(max-width:700px){.dc-d{grid-template-columns:44px minmax(0,1fr)}.dc-d .btns{grid-row:auto;grid-column:1/3;justify-content:flex-start;max-width:none;margin-top:6px}}
/* ---------- AOC messages (the Messages tab, sent as AOC) ---------- */
#acBody{text-transform:uppercase;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;min-height:150px}#acTitle{text-transform:uppercase}
.ac-box{margin-top:6px;background:#1C1C1E;color:#F2F2F2;border-radius:4px;padding:18px 18px 22px;font:500 13.5px/1.5 -apple-system,"Helvetica Neue",Arial,sans-serif;text-transform:uppercase;letter-spacing:.02em}
.ac-box .h{text-align:center;font-weight:600;letter-spacing:.08em;margin-bottom:12px}
.ac-box .b{border:1px solid #5A5A5E;padding:12px 14px;min-height:80px;white-space:pre-wrap;word-break:break-word}.ac-box .b i{display:block;font-style:normal;color:#D98AB4;font-weight:600;margin-bottom:6px}
/* (the AOC list rows are .mail.aoc now) */
.ac-chk{display:flex;gap:8px;align-items:center;margin-top:14px;font-size:14px}.ac-chk input{width:auto;margin:0}
/* a phone or a narrow window: one column */
@media(max-width:900px){main#docs{grid-template-columns:1fr}}
@media(max-width:700px){.thm{flex:none}}
/* ---------- Messages tab: Mail or AOC ---------- */
.kind{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px}
.kd{display:flex;gap:10px;align-items:flex-start;margin:0;padding:11px 13px;border:1px solid var(--line);border-radius:6px;cursor:pointer;font-weight:400;color:var(--ink);background:var(--field)}
.kd input{width:auto;margin:3px 0 0;flex:none}.kd b{display:block;font-weight:600}.kd small{display:block;color:var(--label);font-size:12px;line-height:1.4;margin-top:2px}
.kd:has(input:checked){border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset;background:color-mix(in srgb,var(--accent) 7%,var(--field))}
.kd:has(input:disabled){opacity:.45;cursor:not-allowed}
.lh{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.lh h2{margin:0}
.kf{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}.kf button{border:0;border-radius:0;padding:4px 11px;font-size:12.5px;background:transparent;color:var(--label)}.kf button+button{border-left:1px solid var(--line)}.kf button[aria-pressed=true]{background:var(--soft);color:var(--accent);font-weight:600}
#list{margin-top:12px}
.mail.aoc b{letter-spacing:.04em}.mail.aoc p{grid-column:1/2;margin:2px 0 0;white-space:pre-wrap;word-break:break-word;font:13px/1.5 "IBM Plex Mono",ui-monospace,Consolas,monospace}
@media(max-width:560px){.kind{grid-template-columns:1fr}}
.radio label[hidden]{display:none}input#crCs,input#crAdd{text-transform:uppercase}
.cr-add{display:flex;gap:6px}.cr-add input{flex:1;min-width:0}.cr-add button{margin:0;flex:none}
.cr-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.cr-list .hint{margin:0}
.cr-p{display:inline-flex;align-items:center;gap:6px;padding:3px 3px 3px 11px;border:1px solid var(--line);border-radius:15px;background:var(--bg);font-size:13px}
.cr-p b{font:600 12.5px "IBM Plex Mono",ui-monospace,Consolas,monospace}.cr-p small{color:var(--label);font-size:12px}
.cr-p button{border:0;background:transparent;padding:2px 7px;margin:0;font-size:15px;line-height:1;color:var(--label);border-radius:50%}.cr-p button:hover{color:var(--ink);background:var(--soft)}
/* ---------- Flight Watch (Live tab) ---------- */
.fw{padding:12px 16px 10px;border-bottom:1px solid var(--line);background:var(--bg);max-height:42vh;overflow:auto;flex:none}@media(max-width:900px){.fw{max-height:none}}
.fw-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.fw-h b{font:600 13px Jost,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--bronze)}
.fw-h span{color:var(--label);font-size:12.5px;flex:1}.fw-h span.ok{color:var(--green)}.fw-h button{margin:0;padding:2px 8px;font-size:12px}
.fw-a{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:4px 10px;align-items:start;padding:9px 0 8px;border-top:1px solid var(--line);margin-top:8px}
.fw-a+.fw-a{margin-top:0}
.fw-a i{width:9px;height:9px;border-radius:50%;margin-top:5px;background:#E5A00D}.fw-a.red i{background:#E5484D;box-shadow:0 0 0 3px color-mix(in srgb,#E5484D 25%,transparent);animation:fwP 1.4s ease-in-out infinite}
@keyframes fwP{50%{box-shadow:0 0 0 6px color-mix(in srgb,#E5484D 8%,transparent)}}
.fw-t{font-size:13.5px;line-height:1.35}.fw-t b{font:600 13px "IBM Plex Mono",ui-monospace,Consolas,monospace;margin-right:4px}.fw-a.red .fw-t{color:#C2272D}
.fw-t small{display:block;color:var(--label);font-size:12px;margin-top:2px;word-break:break-word}
.fw-b{display:flex;gap:4px}.fw-b button{margin:0;padding:3px 8px;font-size:12px;height:26px}
#lvList .lv-f.fw-amber{box-shadow:inset 3px 0 0 #E5A00D}#lvList .lv-f.fw-red{box-shadow:inset 3px 0 0 #E5484D}
.fw-n{display:inline-grid;place-items:center;min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:#E5A00D;color:#fff;font:600 10.5px Jost,system-ui,sans-serif;margin-left:2px}
:root[data-theme=dark] .fw-a.red .fw-t{color:#FF8A8E}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .fw-a.red .fw-t{color:#FF8A8E}}
@media(prefers-reduced-motion:reduce){.fw-a.red i{animation:none}}
/* ---------- On-time tab ---------- */
main#ot{max-width:1380px;grid-template-columns:minmax(0,1fr)}main#ot[hidden]{display:none!important}
.ot-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ot-bar h2{margin:0 auto 0 0}.ot-bar button{margin:0}
.ot-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px}
.ot-k{border:1px solid var(--line);border-radius:6px;padding:12px 14px;display:flex;flex-direction:column;gap:3px;min-width:0}
.ot-k span{font:500 11px Jost,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--label)}
.ot-k b{font:400 30px/1.15 Marcellus,Georgia,serif;color:var(--ink)}
.ot-k small{color:var(--label);font-size:12px;line-height:1.35}
.ot-k.good b{color:var(--green)}.ot-k.mid b{color:#C98A00}.ot-k.bad b{color:var(--red)}
.ot-why h3{margin:18px 0 8px;font:500 11px Jost,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--label)}
.ot-why .hint{margin-top:14px}
.ot-bars{display:flex;flex-direction:column;gap:6px;max-width:620px}
.ot-b1{display:grid;grid-template-columns:240px minmax(0,1fr) 34px;align-items:center;gap:10px;font-size:12.5px;color:var(--label)}
.ot-b1 i{display:block;height:9px;border-radius:5px;background:var(--accent);width:var(--w);min-width:4px}
.ot-b1 b{color:var(--ink);text-align:right;font-weight:600}
.ot-f{border-top:1px solid var(--line);padding:11px 0}.ot-f:first-child{border-top:0;padding-top:4px}
.ot-fh{display:flex;align-items:baseline;gap:6px 12px;flex-wrap:wrap}.ot-fh b{font:600 14px "IBM Plex Mono",ui-monospace,monospace;color:var(--ink)}.ot-fh span{color:var(--ink);font-size:13px}.ot-fh small{color:var(--label);font-size:12px}
.ot-st{margin-left:auto;font-style:normal;font-size:12px;font-weight:600;color:var(--accent)}
.ot-ts{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px}
.ot-t{font:500 12.5px "IBM Plex Mono",ui-monospace,monospace;color:var(--ink);white-space:nowrap}.ot-t i{font:500 10.5px Jost,system-ui,sans-serif;letter-spacing:.06em;color:var(--label);margin-right:5px;font-style:normal}.ot-t.no{color:var(--off)}
.ot-d{font-weight:600;font-family:"IBM Plex Mono",ui-monospace,monospace}.ot-d.late{color:var(--red)}.ot-d.ok{color:var(--green)}
.ot-na{color:var(--off)}
#otFind{max-width:280px;width:100%;margin:0;font:inherit;color:var(--ink);background:var(--field);border:1px solid var(--line);border-radius:4px;padding:7px 10px;box-sizing:border-box}
.ot-tw{overflow-x:auto;margin-top:10px;-webkit-overflow-scrolling:touch}
.ot-tb{width:100%;border-collapse:collapse;font-size:13px}
.ot-tb th,.ot-tb td{padding:7px 8px;text-align:left;white-space:nowrap}
.ot-tb td b{font:600 13px "IBM Plex Mono",ui-monospace,monospace;color:var(--ink);display:block}.ot-tb td small{font-size:11.5px;color:var(--label)}
.ot-tb td.m{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px;color:var(--ink)}
.ot-tb select{width:auto;max-width:270px;height:30px;font-size:12.5px;padding:0 6px}
.ot-note{margin-top:12px!important;line-height:1.5}
@media (max-width:700px){.ot-b1{grid-template-columns:130px minmax(0,1fr) 26px;font-size:12px}.ot-k b{font-size:25px}.ot-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}.ot-bar h2{flex-basis:100%}#otFind{max-width:none}}
/* ---------- Calendar tab ---------- */
main#cal{max-width:1380px;grid-template-columns:minmax(0,1fr) 380px;align-items:start}main#cal[hidden]{display:none!important}
.ca-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ca-bar h2{margin:0 4px;min-width:150px;text-align:center;font:400 21px Marcellus,Georgia,serif;letter-spacing:0;text-transform:none;color:var(--ink)}
.ca-bar button{margin:0}.ca-bar [data-ca=prev],.ca-bar [data-ca=next]{width:34px;padding:4px 0;font-size:18px;line-height:1}
.ca-tz{color:var(--label);font-size:12.5px;margin-left:auto}
.ca-legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin:10px 0 8px;font-size:12px;color:var(--label)}.ca-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px;vertical-align:-1px;background:var(--c)}
.ca-wd,.ca-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
.ca-wd span{font:500 11px Jost,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--label);padding:4px 6px}
.ca-grid{border-top:1px solid var(--line);border-left:1px solid var(--line)}
.ca-d{min-height:104px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 4px 6px;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0}
.ca-d:hover{background:var(--soft)}.ca-d.out{background:color-mix(in srgb,var(--soft) 60%,transparent)}.ca-d.out .n{color:var(--off)}
.ca-d .n{font:500 12.5px Jost,system-ui,sans-serif;color:var(--label);padding:1px 3px;align-self:flex-start;border-radius:10px;min-width:22px;text-align:center}
.ca-d.today .n{background:var(--accent);color:var(--bg)}
.ca-c{display:block;width:100%;margin:0;padding:2px 6px 2px 7px;border:0;border-left:3px solid var(--c);border-radius:3px;background:color-mix(in srgb,var(--c) 13%,transparent);color:var(--ink);font:500 11.5px/1.35 Jost,system-ui,sans-serif;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.ca-c b{font:600 10.5px "IBM Plex Mono",ui-monospace,monospace;margin-right:4px;color:var(--label)}
.ca-c.vam{background:transparent;border:1px dashed var(--c);border-left:3px solid var(--c)}
.ca-c.off{opacity:.45;text-decoration:line-through}.ca-c.draft{opacity:.55;font-style:italic}
.ca-c.on{outline:2px solid var(--c);outline-offset:-1px}
.ca-more{font-size:11px;color:var(--label);padding:0 6px}
.ca-side{position:sticky;top:76px;max-height:calc(100vh - 100px);overflow:auto}
.ca-side h3{margin:0 0 2px;font:400 20px Marcellus,Georgia,serif}.ca-side .sub{color:var(--label);font-size:12.5px;margin-bottom:10px}
.ca-up{border-top:1px solid var(--line);padding:9px 2px;cursor:pointer;display:grid;grid-template-columns:52px minmax(0,1fr);gap:2px 10px}.ca-up:hover{background:var(--soft)}
.ca-up time{grid-row:1/3;font:600 12px "IBM Plex Mono",ui-monospace,monospace;color:var(--label);line-height:1.35}.ca-up b{font-weight:600;border-left:3px solid var(--c);padding-left:7px}.ca-up small{color:var(--label);font-size:12px;padding-left:10px}
.ca-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ca-two input{margin:0}
.ca-when{display:grid;grid-template-columns:54px minmax(0,1fr) 126px;gap:6px 8px;align-items:center;margin-top:8px}.ca-when span{font-size:13px;color:var(--label)}.ca-when input{margin:0}.ca-when small{grid-column:2/-1;color:var(--label);font-size:11.5px;margin-top:-3px}
.ca-chk{display:flex;gap:8px;align-items:center;margin-top:12px;font-size:14px;font-weight:400;color:var(--ink)}.ca-chk input{width:auto;margin:0}
.ca-who{margin-top:6px}
.ca-tag{display:inline-block;font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.05em;padding:1px 7px;border-radius:9px;background:color-mix(in srgb,#AF52DE 16%,transparent);color:#8E3FB8;vertical-align:2px;margin-left:6px}
.ca-desc{white-space:pre-wrap;word-break:break-word;font-size:13.5px;color:var(--ink);margin:10px 0 0;max-height:220px;overflow:auto;padding:8px 10px;background:var(--soft);border-radius:4px}
:root[data-theme=dark] .ca-tag{color:#D7A3F0}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .ca-tag{color:#D7A3F0}}
@media(max-width:1100px){main#cal{grid-template-columns:1fr}.ca-side{position:static;max-height:none}}
@media(max-width:700px){.ca-d{min-height:64px}.ca-c{font-size:0;padding:0;height:6px;border:0;background:var(--c)}.ca-c b{display:none}.ca-wd span{font-size:10px;padding:4px 2px}.ca-bar h2{min-width:0;font-size:18px}.ca-tz{display:none}}
/* ---------- shell: the header stays, the sections are in a sidebar (Nov 2026) ---------- */
header{position:sticky;top:0;z-index:20}
.side{position:fixed;top:var(--hdr);left:0;bottom:0;width:212px;overflow-y:auto;background:var(--bg);border-right:1px solid var(--line);padding:12px 10px 16px;display:flex;flex-direction:column;gap:1px;z-index:15}
.side a{display:flex;align-items:center;gap:11px;padding:7px 10px;border-radius:6px;color:var(--label);text-decoration:none;font:500 14px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;white-space:nowrap}
.side a>span:first-of-type{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.side a svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.side a:hover{background:var(--soft);color:var(--ink)}
.side a[aria-current=true]{background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent)}
.side .sg{font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--label);padding:16px 10px 5px}
.side .sx{margin-top:auto}
.side .lv-n{background:var(--soft);color:var(--label);border:1px solid var(--line);padding:2px 6px}
.side a[aria-current=true] .lv-n{background:var(--bg)}
#ibCount{background:var(--teal);color:#fff;border-color:var(--teal)}
.lv-n.q{background:var(--q-bg);color:var(--q);border:0}
.fw-n.red{background:var(--red)}:root[data-theme=dark] .fw-n.red{background:#C2453F}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .fw-n.red{background:#C2453F}}
body{padding-left:212px}
body:has(.deny){padding-left:0}.deny~.side{display:none}
main{scroll-margin-top:70px}
main#live{height:calc(100vh - var(--hdr));height:calc(100svh - var(--hdr))}
@media(max-width:900px){
 body{padding-left:0}
 .side{position:sticky;top:var(--hdr);bottom:auto;width:auto;flex-direction:row;align-items:center;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid var(--line);padding:6px 8px;gap:2px;scrollbar-width:none}
 .side::-webkit-scrollbar{display:none}
 .side .sg{display:none}.side .sx{margin-top:0}
 .side a{flex:none;padding:6px 11px;gap:7px}.side a svg{width:16px;height:16px}
 main#live{height:auto}
}
/* page headings with a ? for the explanation, instead of paragraphs of text */
.pg-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}.pg-h h2{margin:0}
.help{position:relative;display:inline-block}
.help>summary{list-style:none;cursor:pointer;width:22px;height:22px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font:600 12px Jost,system-ui,sans-serif;color:var(--label);background:var(--field)}
.help>summary::-webkit-details-marker{display:none}
.help>summary:hover,.help[open]>summary{color:var(--accent);border-color:var(--accent)}
.help>div{position:absolute;z-index:30;top:30px;left:-10px;width:min(380px,80vw);background:var(--bg);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.14);padding:12px 14px;font-size:13px;color:var(--ink);line-height:1.5;text-transform:none;letter-spacing:0}
.help>div p{margin:0 0 8px}.help>div p:last-child{margin:0}
/* the live connections cannot get through and the sign-in has likely run out (P2, Nov 2026) */
.ws-auth{position:fixed;z-index:80;left:50%;bottom:18px;transform:translateX(-50%);width:min(560px,calc(100vw - 24px));margin:0;display:flex;gap:12px;align-items:center;box-shadow:0 8px 28px rgba(0,0,0,.18)}
.ws-auth span{flex:1}.ws-auth button{flex:none}
.fo-err{margin:0 0 8px;font-size:13px}
a.lk{color:var(--accent);text-decoration:none;font-size:13px;font-weight:500}a.lk:hover{text-decoration:underline}
/* status colours only: the AOC button and tag are not pink (the pink rules are gone, P2 Nov 2026) */
.lv-dbtn button.aoc,.tag.a,.mail.aoc b{color:var(--ink);border-color:var(--line)}
.tag.a{background:var(--soft);border:1px solid var(--line);color:var(--label)}

/* ---------- Home ---------- */
main#home{max-width:1380px;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);align-items:start}
.hm-bar{grid-column:1/-1;display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:16px 20px}
.hm-clock{display:flex;flex-direction:column;min-width:150px}
.hm-clock b{font:500 30px/1.05 "IBM Plex Mono",ui-monospace,Consolas,monospace;letter-spacing:-.01em;color:var(--ink)}
.hm-clock span{font-size:12.5px;color:var(--label);margin-top:3px}
/* the UTC clock as a split-flap board: each digit flips when it changes (top half falls, bottom half lands) */
.hm-clock{--fl-bg:#1C2A2D;--fl-ink:#F2F5F5}
:root[data-theme=dark] .hm-clock{--fl-bg:#2B2B2F;--fl-ink:#EDEDEF}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .hm-clock{--fl-bg:#2B2B2F;--fl-ink:#EDEDEF}}
.hm-clock b.flapclk{display:flex;align-items:center;gap:2px;font-weight:600}
.hm-clock b.flapclk span{font-size:inherit;margin-top:0}.hm-clock b.flapclk .fs,.hm-clock b.flapclk .fz{color:var(--ink)}
.flapclk .fd{position:relative;display:inline-block;width:.9em;height:1.2em;perspective:240px;border-radius:5px}
.flapclk .fh{position:absolute;left:0;right:0;height:50%;overflow:hidden;background:var(--fl-bg);color:var(--fl-ink);display:flex;justify-content:center;backface-visibility:hidden}
.flapclk .fh i{font-style:normal;display:block;height:200%;line-height:1.2em}
.flapclk .ft{top:0;border-radius:5px 5px 0 0;transform-origin:50% 100%}
.flapclk .fb{bottom:0;border-radius:0 0 5px 5px;transform-origin:50% 0}
.flapclk .fb i{transform:translateY(-50%)}
.flapclk .fd::after{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:var(--bg);z-index:5}
.flapclk .fl1{z-index:3;animation:hmFlT .16s ease-in forwards}
.flapclk .fl2{z-index:3;transform:rotateX(90deg);animation:hmFlB .16s .16s ease-out forwards}
@keyframes hmFlT{to{transform:rotateX(-90deg)}}
@keyframes hmFlB{to{transform:rotateX(0)}}
.flapclk .fs{display:inline-block;width:.42em;text-align:center}
.flapclk .fz{margin-left:3px}
@media(prefers-reduced-motion:reduce){.flapclk .fl1,.flapclk .fl2{animation:none;display:none}}
.hm-k{display:flex;gap:10px;flex-wrap:wrap;flex:1;justify-content:flex-end}
.hm-c{min-width:118px;padding:9px 14px;border:1px solid var(--line);border-radius:8px;background:var(--soft);text-decoration:none;color:inherit;display:flex;flex-direction:column}
.hm-c:hover{border-color:var(--accent)}
.hm-c span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--label)}
.hm-c b{font:400 24px/1.15 Marcellus,Georgia,serif;color:var(--ink);margin-top:2px}
.hm-c small{font-size:11.5px;color:var(--label)}
.hm-c.good b{color:var(--green)}.hm-c.mid b{color:#B7791F}.hm-c.bad b,.hm-c.red b{color:var(--red)}
:root[data-theme=dark] .hm-c.mid b{color:#E8B86A}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .hm-c.mid b{color:#E8B86A}}
.hm-col{display:flex;flex-direction:column;gap:24px;min-width:0}
#hmAct{margin-top:10px}
.hm-i{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:2px 12px;align-items:center;width:100%;text-align:left;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent;padding:11px 4px;color:var(--ink);font:inherit;cursor:pointer}
.hm-i:first-child{border-top:0}.hm-i:hover{background:var(--soft)}
.hm-i>i{width:9px;height:9px;border-radius:50%;background:var(--off);align-self:start;margin-top:6px}
.hm-i.red>i{background:var(--red)}.hm-i.amber>i{background:#E5A00D}.hm-i.info>i{background:var(--accent)}
.hm-i b{font-weight:600}.hm-i .t{min-width:0}.hm-i .t small{display:block;color:var(--label);font-size:12.5px;margin-top:1px}
.hm-i em{font-style:normal;font-size:12.5px;color:var(--accent);white-space:nowrap;font-weight:500}
.hm-ok{display:flex;gap:10px;align-items:center;color:var(--green);font-size:14px;padding:8px 2px}.hm-ok svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2}
.hm-f{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:1px 12px;align-items:center;width:100%;text-align:left;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent;padding:9px 2px;font:inherit;color:var(--ink);cursor:pointer}
.hm-f:first-child{border-top:0}.hm-f:hover{background:var(--soft)}
.hm-f .cs{font:600 14px "IBM Plex Mono",ui-monospace,Consolas,monospace}
.hm-f .rt{font-size:13.5px}.hm-f .rt small{color:var(--label);font-size:12px;margin-left:6px}
.hm-f .st{font-size:12px;color:var(--label);text-align:right;white-space:nowrap}
.hm-f .st b{display:block;font:500 12.5px "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--ink)}
.hm-u{display:grid;grid-template-columns:62px minmax(0,1fr);gap:2px 12px;padding:9px 2px;border-top:1px solid var(--line);text-decoration:none;color:inherit}
.hm-u:first-child{border-top:0}
.hm-u time{font:500 12px/1.35 "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--label)}
.hm-u b{font-weight:500}.hm-u small{grid-column:2;color:var(--label);font-size:12px}
#hmFl,#hmUp{margin-top:8px}
/* a role's Home (Settings › Roles): only the parts of the pages it sees; a menu heading with none of its pages goes */
html.no-p-fw.no-p-gates.no-p-settings.no-p-reports.no-p-navdata .sg[data-sg=ops],html.no-p-pilots.no-p-cal .sg[data-sg=crew],html.no-p-comms.no-p-docs .sg[data-sg=comm]{display:none}
html.no-p-fw #hmFlS,html.no-p-cal #hmUpS,html.no-p-fw.no-p-cal .hm-col,html.no-p-fw.no-p-reports.no-p-comms.no-p-navdata .hm-act{display:none}
html.no-p-fw.no-p-cal main#home,html.no-p-fw.no-p-reports.no-p-comms.no-p-navdata main#home{grid-template-columns:minmax(0,1fr)}
@media(max-width:900px){main#home{grid-template-columns:1fr}.hm-k{justify-content:flex-start}}

/* ---------- Tasks: a board per state; the open task beside it (like a pilot's profile) ---------- */
:root{--tk-todo:#8CBDC3;--tk-doing:#1A6772}
:root[data-theme=dark]{--tk-todo:#3D767C;--tk-doing:#7CC2C9}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--tk-todo:#3D767C;--tk-doing:#7CC2C9}}
main#tasks{display:block;max-width:1380px}main#tasks[hidden]{display:none!important}
.tk-top{margin-bottom:16px}
.tk-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px 16px;flex-wrap:wrap}.tk-h h2{margin-bottom:4px}
.tk-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.tk-tools select{width:auto;min-width:190px;padding:7px 10px}
.tk-mail{margin-top:6px;font-size:12.5px;color:var(--label)}.tk-mail label{display:inline-flex;gap:6px;align-items:center;cursor:pointer;margin:0;font-weight:400;color:var(--ink)}.tk-mail input{width:auto;margin:0}.tk-mail small{color:var(--off)}
html.no-a-tasks [data-tknew]{display:none!important}
.tk-form{margin-top:16px;border-top:1px solid var(--line)}.tk-form textarea{min-height:110px}.tk-form label small{font-weight:400;color:var(--off)}
.tk-f2{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 12px}
.tk-body{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}.tk-body.on{grid-template-columns:minmax(0,1fr) 400px}
.tk-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
.tk-col{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:14px 12px 6px}
.tk-col h3{margin:0 0 10px;font:500 12px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--label);display:flex;align-items:center;gap:8px}
.tk-col h3 i{width:9px;height:9px;border-radius:50%;background:var(--off);flex:none}.tk-col.todo h3 i{background:var(--tk-todo)}.tk-col.doing h3 i{background:var(--tk-doing)}.tk-col.done h3 i{background:var(--green)}
.tk-col h3 b{font-weight:600;color:var(--ink);letter-spacing:0}.tk-col h3 small{margin-left:auto;font-size:11px;letter-spacing:0;text-transform:none;color:var(--off)}
.tk-col .empty{display:block;padding:4px 2px 12px;font-size:13px}
.tk-c{display:block;width:100%;text-align:left;border:1px solid var(--line);border-left:3px solid var(--line);border-radius:6px;background:var(--bg);padding:10px 12px;margin:0 0 8px;font:inherit;color:var(--ink);cursor:pointer}
.tk-c:hover{background:var(--soft)}.tk-c.p1{border-left-color:#D9930D}.tk-c.p2{border-left-color:var(--red)}.tk-c.sel{outline:2px solid var(--accent);outline-offset:-1px}
.tk-c .t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:600;font-size:14.5px;line-height:1.35}
.tk-c.done .t{color:var(--label)}
.tk-m{display:flex;gap:4px 10px;flex-wrap:wrap;align-items:center;margin-top:6px;font-size:12px;color:var(--label)}
.tk-dp{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--bronze)}
.tk-p{display:inline-flex;align-items:center;gap:5px}
.tk-av{width:18px;height:18px;border-radius:50%;display:inline-grid;place-items:center;font:600 9.5px/1 Jost,system-ui,sans-serif;font-style:normal;background:color-mix(in srgb,var(--accent) 16%,var(--bg));color:var(--accent);flex:none}
.tk-late{color:var(--red);font-weight:600}
.tk-pri{font-size:11px;font-weight:600;letter-spacing:.03em;padding:0 7px;border-radius:9px;line-height:18px}.tk-pri.p1{color:#8A5A06;background:#FBEFD6}.tk-pri.p2{color:var(--red);background:var(--err-bg)}
:root[data-theme=dark] .tk-pri.p1{color:#E8B86A;background:#3A2E19}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .tk-pri.p1{color:#E8B86A;background:#3A2E19}}
.tk-det{position:sticky;top:83px}.tk-det .pf-h h3{margin:2px 0 0;font:600 18px/1.3 Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;overflow-wrap:anywhere}
.tk-st{display:flex;margin-top:14px}.tk-st button{flex:1}
.tk-kv{display:grid;grid-template-columns:88px minmax(0,1fr);gap:9px 12px;font-size:13.5px;margin:14px 0 4px;align-items:center}.tk-kv>span{color:var(--label);font-size:12.5px}.tk-kv select{padding:6px 9px;font-size:13.5px}
.tk-md{font-size:14px;margin-top:10px;overflow-wrap:anywhere}.tk-md p{margin:0 0 8px}.tk-md ul{margin:0 0 8px;padding-left:20px}.tk-md h4{margin:10px 0 4px;font-size:14px}
.tk-ev{display:flex;flex-direction:column;gap:9px;margin-bottom:12px}.tk-e{font-size:13px;color:var(--label)}.tk-e b{color:var(--ink);font-weight:600}.tk-e time{margin-left:8px;font-size:12px;color:var(--off)}
.tk-e.note{padding:8px 10px;border-radius:6px;background:var(--soft);color:var(--ink)}.tk-e.note .tk-md{margin-top:4px;font-size:13.5px}.tk-e.note .tk-md p:last-child{margin-bottom:0}
#tkNote{min-height:70px;font-size:14px}
@media(max-width:1100px){.tk-body.on{grid-template-columns:1fr}.tk-det{position:static;order:-1}}
@media(max-width:760px){.tk-board{grid-template-columns:1fr}.tk-f2{grid-template-columns:1fr 1fr}.tk-tools{width:100%}.tk-tools select{flex:1;min-width:0}}
/* Home: what each department is doing (publishers), or the department's own tasks */
.hm-tk{grid-column:1/-1}
.tk-lg{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--label);margin:2px 0 4px}.tk-lg i{display:inline-block;width:10px;height:8px;border-radius:2px;margin-right:6px}
i.doing,.hm-i.doing>i{background:var(--tk-doing)}i.todo,.hm-i.todo>i{background:var(--tk-todo)}
.tk-dr{display:grid;grid-template-columns:minmax(130px,200px) minmax(0,1fr) minmax(0,280px);gap:6px 18px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.tk-dr:nth-child(2){border-top:0}
.tk-dn{border:0;background:transparent;padding:0;text-align:left;font:inherit;color:inherit;cursor:pointer;min-width:0}.tk-dn b{display:block;font-weight:600;font-size:14.5px}.tk-dn small{color:var(--label);font-size:12px}.tk-dn:hover b{color:var(--accent)}
.tk-bar{display:flex;gap:2px;height:8px}.tk-bar span{height:8px;min-width:6px}.tk-bar span.doing{background:var(--tk-doing)}.tk-bar span.todo{background:var(--tk-todo)}
.tk-bar span:first-child{border-radius:4px 0 0 4px}.tk-bar span:last-child{border-radius:0 4px 4px 0}.tk-bar span:only-child{border-radius:4px}
.tk-fig{font-size:13px;color:var(--ink);display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline}.tk-fig small{color:var(--label);font-size:12px}.tk-fig .none{color:var(--label)}
.tk-now{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--label);align-items:baseline}
.tk-now button{border:0;background:transparent;padding:0;font:inherit;font-weight:500;color:var(--ink);cursor:pointer;text-align:left}.tk-now button:hover{color:var(--accent);text-decoration:underline}
@media(max-width:700px){.tk-dr{grid-template-columns:minmax(0,1fr)}.tk-now{grid-column:1}.tk-bar:empty{display:none}}

/* ---------- Messages: the Inbox and what was sent, with the conversation or the composer beside ---------- */
main#comms{max-width:1380px;grid-template-columns:minmax(0,380px) minmax(0,1fr);align-items:start}
.cm-side{padding:0;display:flex;flex-direction:column;min-height:0;position:sticky;top:83px;max-height:calc(100vh - 83px - 16px);max-height:calc(100svh - 83px - 16px)}
.cm-h{display:flex;align-items:center;gap:10px;padding:16px 18px 0}.cm-h h2{margin:0}
.cm-new{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 18px 12px}
.cm-new button{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:8px 10px;font-size:13.5px}
.cm-new svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;flex:none}
.cm-seg{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.cm-seg button{border:0;border-radius:0;background:transparent;color:var(--label);padding:10px 4px 9px;font-size:13.5px;border-bottom:2px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.cm-seg button[aria-pressed=true]{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.cm-f{display:flex;gap:8px;align-items:center;padding:10px 18px;border-bottom:1px solid var(--line)}.cm-f select{flex:1;padding:6px 8px;font-size:13.5px}
.cm-side .ib-list,.cm-list{overflow:auto;max-height:none;flex:1;min-height:120px}
.cm-i{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;padding:11px 18px;border-left:3px solid transparent;font:inherit;color:var(--ink)}
.cm-i:hover{background:var(--soft)}.cm-i.on{background:var(--soft);border-left-color:var(--accent)}
.cm-i b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-i time{color:var(--label);font-size:12px;white-space:nowrap}
.cm-i .meta{grid-column:1/3;color:var(--label);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-k{display:inline-block;font:600 10px Jost,system-ui,sans-serif;letter-spacing:.06em;border:1px solid var(--line);border-radius:4px;padding:0 5px;margin-right:6px;color:var(--label);vertical-align:1px}
.cm-k.q{border-color:transparent;background:var(--q-bg);color:var(--q)}
.cm-main{min-height:420px}
.cm-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;min-height:360px;color:var(--label);font-size:14px;padding:20px}
.cm-empty svg{width:40px;height:40px;fill:none;stroke:var(--off);stroke-width:1.4;margin-bottom:6px}.cm-empty b{color:var(--ink);font-weight:500;font-size:15px}.cm-empty span{max-width:380px}
.cm-ch{display:flex;align-items:center;justify-content:space-between;gap:10px}.cm-ch h2{margin:0}
.cm-x{border:0;background:transparent;color:var(--label);font-size:16px;padding:4px 8px}.cm-x:hover{color:var(--ink)}
.cm-v h3{margin:0;font:400 21px Marcellus,Georgia,serif}.cm-v .meta{color:var(--label);font-size:13px;margin-top:4px}
.cm-v .cm-body{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}.cm-v .cm-body p{margin:0 0 10px}
.cm-v .ac-box{margin-top:14px}.cm-v .atts{margin-top:10px}
@media(max-width:900px){main#comms{grid-template-columns:1fr}.cm-side{position:static;max-height:none}.cm-side .ib-list,.cm-list{max-height:50vh}}

/* ---------- page headings (Nov 2026): the title, one line under it, the state on the right ---------- */
.pg-top{grid-column:1/-1;display:flex;justify-content:space-between;align-items:flex-end;gap:10px 20px;flex-wrap:wrap}
.pg-top h1{margin:0;font:400 26px/1.2 Marcellus,Georgia,serif;color:var(--ink)}
.pg-top p{margin:3px 0 0;color:var(--label);font-size:14px}
.pg-top>.help{align-self:center}
.pg-st{display:flex;gap:8px 16px;align-items:center;flex-wrap:wrap;font-size:13.5px;color:var(--label)}
.pg-st>span{display:inline-flex;gap:6px;align-items:center}
.bdg{display:inline-block;padding:0 9px;border-radius:99px;font:500 12px/1.75 Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;white-space:nowrap;background:var(--mist);color:var(--label)}
.bdg.on{background:var(--ok-bg);color:var(--green)}.bdg.bad{background:var(--err-bg);color:var(--red)}.bdg.adm{background:var(--mist);color:var(--accent)}.bdg.role{background:var(--q-bg);color:var(--q)}
button.lnk{border:0;background:transparent;padding:4px 6px;color:var(--accent);font-size:13.5px}button.lnk:hover{text-decoration:underline}button.lnk.warn{color:var(--red)}
html.efb-thm header .thm{display:none!important}
.lbl{color:var(--label)}.mono{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:13.5px}
/* tables (Gates, Settings) */
.gt-tw{overflow-x:auto}
table.gt-t{border-collapse:collapse;width:100%;font-size:14px}
.gt-t th{text-align:left;font:500 11.5px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--label);padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.gt-t td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.gt-t>tbody>tr:last-child>td{border-bottom:0}
.gt-t .r{text-align:right;white-space:nowrap}
.gt-t .k2{display:inline-block;font:600 10px Jost,system-ui,sans-serif;letter-spacing:.06em;border:1px solid var(--line);border-radius:4px;padding:0 5px;margin-right:7px;color:var(--label);vertical-align:1px}
.gt-t b{font-weight:500}

/* ---------- Gates (Nov 2026): the airports, the map and rules of one, the gates sent ---------- */
main#stands{max-width:1380px;grid-template-columns:240px minmax(0,1fr);align-items:start}main#stands[hidden]{display:none!important}
main#stands>.gt-log{grid-column:1/-1}
main#stands{--r0:#2a78d6;--r1:#eb6834;--r2:#1baf7a;--r3:#eda100;--r4:#e87ba4;--r5:#008300;--r6:#6250d6;--r7:#e34948;--rx:#7B8A8C;--rn:#BAC5C6;--n0:#fff;--n1:#fff;--n2:#0F2A2E;--n3:#0F2A2E;--n4:#0F2A2E;--n5:#fff;--n6:#fff;--n7:#fff;--nx:#fff;
 --m-bg:#E8EDEC;--m-f:#DFE7E1;--m-a:#D2DADA;--m-r:#9CA8A9;--m-t:#BAC4C4;--m-b:#C6CFCF;--m-bt:#B4C1C2;--m-tx:#51696C;--m-no:#B1BCBD;--m-ink:#0F2A2E;--m-ring:#FFFFFF}
:root[data-theme=dark] main#stands{--r0:#3987e5;--r1:#d95926;--r2:#199e70;--r3:#c98500;--r4:#d55181;--r5:#0ca30c;--r6:#9085e9;--r7:#e66767;--rx:#6C7477;--rn:#4C5457;--n3:#1A1A1C;--n6:#1A1A1C;--n7:#1A1A1C;--n2:#fff;--n4:#fff;
 --m-bg:#141618;--m-f:#191C1E;--m-a:#25292C;--m-r:#40474B;--m-t:#33393D;--m-b:#2D3337;--m-bt:#363E43;--m-tx:#9C9CA1;--m-no:#4A5255;--m-ink:#E8E8E9;--m-ring:#141618}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]) main#stands{--r0:#3987e5;--r1:#d95926;--r2:#199e70;--r3:#c98500;--r4:#d55181;--r5:#0ca30c;--r6:#9085e9;--r7:#e66767;--rx:#6C7477;--rn:#4C5457;--n3:#1A1A1C;--n6:#1A1A1C;--n7:#1A1A1C;--n2:#fff;--n4:#fff;
 --m-bg:#141618;--m-f:#191C1E;--m-a:#25292C;--m-r:#40474B;--m-t:#33393D;--m-b:#2D3337;--m-bt:#363E43;--m-tx:#9C9CA1;--m-no:#4A5255;--m-ink:#E8E8E9;--m-ring:#141618}}
.r0{--c:var(--r0);--cn:var(--n0)}.r1{--c:var(--r1);--cn:var(--n1)}.r2{--c:var(--r2);--cn:var(--n2)}.r3{--c:var(--r3);--cn:var(--n3)}.r4{--c:var(--r4);--cn:var(--n4)}.r5{--c:var(--r5);--cn:var(--n5)}.r6{--c:var(--r6);--cn:var(--n6)}.r7{--c:var(--r7);--cn:var(--n7)}.rx{--c:var(--rx);--cn:var(--nx)}.rn{--c:var(--rn);--cn:var(--ink)}
.sw{display:inline-block;width:11px;height:11px;border-radius:50%;background:var(--c);flex:none;vertical-align:-1px}
.sw.occ{background:var(--m-ink)}.sw.giv{background:transparent;box-shadow:0 0 0 2px var(--label) inset}
.gt-apts{padding:14px;position:sticky;top:83px}
.gt-al{display:flex;flex-direction:column;gap:1px;margin-top:10px;max-height:calc(100vh - 300px);min-height:120px;overflow:auto}
.ga{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:8px;align-items:baseline;text-align:left;border:0;background:transparent;padding:7px 9px;border-radius:6px;color:var(--ink);font-weight:400;width:100%}
.ga:hover{background:var(--soft)}
.ga b{font:600 13px "IBM Plex Mono",ui-monospace,Consolas,monospace}
.ga span{font-size:12.5px;color:var(--label);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ga small{font-size:12px;color:var(--off);white-space:nowrap}.ga.has small{color:var(--label)}
.ga[aria-pressed=true]{background:var(--mist)}.ga[aria-pressed=true] b{color:var(--accent)}
.ga.add{border:1px dashed var(--line);margin-top:4px}.ga.add small{color:var(--accent);font-size:15px;line-height:1}
.gt-apts>.hint{margin-top:10px}
.gt-h{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.gt-h .pg-h{margin:0}
.gt-h .kf button:disabled{opacity:.45}
.gm-note{margin:0 0 10px!important}
.gm-wait{padding:80px 0;text-align:center;color:var(--label);font-size:14px;background:var(--soft);border-radius:6px}
/* the airport map */
.gm{position:relative;border-radius:6px;overflow:hidden;background:var(--m-bg);border:1px solid var(--line)}
#stSvg{display:block;width:100%;height:470px;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
#stSvg:active{cursor:grabbing}
.gm .m-f{fill:var(--m-f)}.gm .m-a{fill:var(--m-a)}.gm .m-ra{fill:var(--m-r)}
.gm .m-r{fill:none;stroke:var(--m-r)}.gm .m-r.s{opacity:.55}
.gm .m-t{fill:none;stroke:var(--m-t);stroke-width:2;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
.gm .m-b{fill:var(--m-b)}.gm .m-b.t{fill:var(--m-bt)}
.gm .ml{font:500 11.5px Jost,"Avenir Next","Segoe UI",system-ui,sans-serif;fill:var(--m-tx);text-anchor:middle;dominant-baseline:middle;pointer-events:none;paint-order:stroke;stroke:var(--m-bg);stroke-width:3px;stroke-opacity:.7}
.gm .ml.rw{font:500 10.5px "IBM Plex Mono",ui-monospace,monospace}
.gm .nr{fill:var(--m-no)}
.gs{cursor:pointer}.gs .hit{fill:transparent}
.gs .d{fill:var(--c);stroke:var(--m-ring);stroke-width:1.5}
.gs .dn{font:600 9.5px Jost,system-ui,sans-serif;fill:var(--cn);text-anchor:middle;pointer-events:none}
.gs .lb{font:500 10.5px "IBM Plex Mono",ui-monospace,monospace;fill:var(--m-ink);text-anchor:middle;pointer-events:none;paint-order:stroke;stroke:var(--m-bg);stroke-width:3px}
.gs .oc{fill:var(--m-ink);stroke:var(--m-ring);stroke-width:1.5}.gs .ox{stroke:var(--m-bg);stroke-width:1.7;fill:none;stroke-linecap:round}
.gs .gv{fill:none;stroke:var(--c);stroke-width:2.5}.gs .gv.rn{stroke:var(--label)}
.gs .hl{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-dasharray:4 3}
.gs.on .d,.gs.on .oc{stroke:var(--accent);stroke-width:3}
.gm-z{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--bg);box-shadow:0 2px 8px rgba(0,0,0,.08)}
.gm-z button{border:0;border-radius:0;padding:3px 0;width:32px;height:32px;font-size:17px;line-height:1;background:var(--bg);color:var(--ink)}.gm-z button+button{border-top:1px solid var(--line)}.gm-z button:hover{background:var(--soft)}
.gp{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.45;box-shadow:0 10px 28px -12px rgba(15,42,46,.45);color:var(--ink)}
.gm-pop{position:absolute;z-index:3;width:260px}
.gp-h{display:flex;align-items:center;gap:6px;margin-bottom:2px}.gp-h b{font:600 14px "IBM Plex Mono",ui-monospace,monospace}
.gp-x{margin-left:auto;border:0;background:transparent;padding:0 4px;color:var(--label);font-size:14px}.gp-x:hover{color:var(--ink)}
.gp-r{display:flex;gap:7px;align-items:center;margin-top:3px}.gp-r small{color:var(--label)}
.gp-s{margin-top:4px;font-weight:500}.gp-s.giv{color:var(--q)}
.gp-a{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:9px;padding-top:9px;border-top:1px solid var(--line)}.gp-a span{font-size:12px;color:var(--label);margin:0 2px}
.gp-a button{padding:3px 9px;font-size:12.5px;display:inline-flex;gap:5px;align-items:center}
.gm-leg{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:12.5px;color:var(--ink)}.gm-leg>span{display:inline-flex;gap:6px;align-items:center}.gm-leg small{color:var(--label);font-size:12px}
.gm-leg small::before{content:"· "}
#stMiss{margin-top:8px}
.gt-bad{color:var(--red);font-family:"IBM Plex Mono",ui-monospace,monospace}
.gt-cg{color:var(--q);font-weight:500}
/* the same stands as a list */
.gl{display:flex;flex-direction:column;gap:14px}
.gl-h{display:flex;gap:7px;align-items:center;margin-bottom:6px;font-size:13.5px;font-weight:500}.gl-h small{color:var(--label);font-weight:400;font-size:12.5px}.gl-h small::before{content:"· "}
.gl-c{display:flex;flex-wrap:wrap;gap:5px}
.gc{position:relative;font:500 12.5px "IBM Plex Mono",ui-monospace,monospace;padding:3px 8px 3px 21px;border-radius:5px;border:1px solid var(--line);background:var(--field);color:var(--ink)}
.gc::before{content:"";position:absolute;left:7px;top:50%;width:9px;height:9px;margin-top:-4.5px;border-radius:50%;background:var(--c)}
.gc.occ{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.gc.giv{border-color:var(--c);box-shadow:0 0 0 1px var(--c) inset}
.gc.on{outline:2px solid var(--accent);outline-offset:1px}
.gl-pop{max-width:340px}
/* the rules */
#stRules{margin-top:18px}
.gt-r td:first-child{white-space:nowrap;width:52px;font:600 12.5px "IBM Plex Mono",ui-monospace,monospace;color:var(--label)}
.gt-ch{display:inline-block;font:500 12.5px "IBM Plex Mono",ui-monospace,monospace;padding:1px 7px;border:1px solid var(--line);border-radius:5px;margin:2px 4px 2px 0;background:var(--field);white-space:nowrap}
.gt-ch.bad{color:var(--red);border-color:var(--red-l)}
.gt-er>td{background:var(--soft)}
.gt-e>label:first-child{margin-top:4px}
.gt-e input.sr{text-transform:uppercase;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace}
.gt-e3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.gt-e input.tm{text-transform:uppercase}
.gt-e .actions{margin-top:14px}
.st-x{font-size:12px;color:var(--label);margin-top:5px;word-break:break-word}.st-x.bad{color:var(--red)}
.gt-none{margin:0!important;font-size:13.5px!important}
.gt-act{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}.gt-act .sp{flex:1}.gt-dirty{font-size:12.5px;color:var(--q);font-weight:500}
.st-warn{margin:12px 0 0;padding:9px 12px;border-radius:6px;background:#FBF0DA;color:#5C4108;font-size:13px;border-left:3px solid #D9930D}
:root[data-theme=dark] .st-warn{background:#3A2E19;color:#F0D9AE}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .st-warn{background:#3A2E19;color:#F0D9AE}}
.gt-try{margin-top:18px;padding:12px 14px;background:var(--soft);border-radius:6px;display:flex;gap:8px 10px;align-items:center;flex-wrap:wrap;font-size:14px}
.gt-try .l{color:var(--label);font-weight:500;font-size:13px;letter-spacing:.04em;text-transform:uppercase}
.gt-try select{width:auto;padding:5px 8px;font-size:13.5px}
.gt-try b{font:600 14px "IBM Plex Mono",ui-monospace,monospace}
.st-lb{display:flex;gap:8px;align-items:center}.st-lb button#stReload{padding:5px 12px;font-size:13px}
.gt-lt .mono b,.gt-lt b.mono{font-weight:600}
.gt-chg>td{background:var(--soft)}.chg{display:flex;gap:6px;flex-wrap:wrap}.chg input{width:120px;margin:0;text-transform:uppercase}.chg button{margin:0}
@media(max-width:900px){main#stands{grid-template-columns:minmax(0,1fr)}.gt-apts{position:static}.gt-al{flex-direction:row;overflow-x:auto;max-height:none;min-height:0;padding-bottom:4px}.ga{grid-template-columns:auto auto;width:auto;flex:none}.ga span{display:none}}
@media(max-width:600px){.gt-e3{grid-template-columns:1fr}.gm-pop{width:220px}}

/* ---------- Automatic messages (Nov 2026) ---------- */
main#auto{display:block;max-width:1120px}main#auto[hidden]{display:none!important}
main#auto>*+*{margin-top:20px}main#auto>#auMsg{margin-top:0}
.au-l{padding:0;overflow:hidden}
.au-r+.au-r{border-top:1px solid var(--line)}
.au-r.open{background:var(--soft)}
.au-h{display:flex;align-items:center;gap:8px 16px;padding:14px 20px;flex-wrap:wrap}
.au-sw{display:flex;gap:14px;align-items:center;flex:1 1 360px;margin:0;font-weight:400;font-size:15px;color:var(--ink);cursor:pointer}
.au-sw b{display:block;font-weight:500}.au-sw small{display:block;color:var(--label);font-size:13px;line-height:1.4}
.au-sw input{appearance:none;-webkit-appearance:none;flex:none;width:40px;height:23px;border-radius:12px;background:var(--off);position:relative;margin:0;cursor:pointer;transition:background .15s}
.au-sw input::after{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s}
.au-sw input:checked{background:var(--teal)}.au-sw input:checked::after{left:20px}
.au-sw input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.au-sw input:disabled{opacity:.6}
.au-last{font-size:13px;color:var(--label);min-width:160px}
.au-ed{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,380px);gap:24px;padding:2px 20px 22px}
.au-ec{display:grid;gap:12px;min-width:0;align-content:start}
.au-tm{display:flex;gap:10px 20px;flex-wrap:wrap;align-items:flex-end}.au-tm label{margin:0 0 6px}.au-tm select{width:auto}.au-tm .lk{padding-bottom:9px}
.au-n{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--ink)}
#auto input[type=number]{width:84px;font:inherit;color:var(--ink);background:var(--field);border:1px solid var(--line);border-radius:4px;padding:8px 10px}
.au-when{margin:0!important}
.au-more summary{cursor:pointer;color:var(--accent);font-size:13.5px;font-weight:500}.au-more summary small{color:var(--label);font-weight:400}
.au-more[open]{display:grid;gap:12px}.au-more[open]>summary{margin-bottom:0}
.au-pv{display:grid;gap:8px;align-content:start;min-width:0}
#auto .at-f textarea,#auto .at-f input{font:13px/1.45 "IBM Plex Mono",ui-monospace,Consolas,monospace;text-transform:none;min-height:0;white-space:pre;overflow-x:auto}
.au-foot{font-size:13.5px!important}
@media(max-width:860px){.au-ed{grid-template-columns:1fr}.au-last{min-width:0}}

/* ---------- Settings (Nov 2026): People and Roles ---------- */
main#settings{display:block;max-width:1120px}main#settings[hidden]{display:none!important}
main#settings>*+*{margin-top:20px}
.set-h{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.set-h .pg-h{margin:0}.set-h>span{font-size:13.5px}
.set-h #rlNew{padding:6px 14px;font-size:13.5px}
.rl-you{color:var(--label);font-size:12px;margin-left:8px}
input.rl-pid{width:120px;padding:4px 8px;font:13px "IBM Plex Mono",ui-monospace,monospace;text-transform:uppercase}.rl-add input.rl-pid{width:170px;padding:8px 10px}
.rl-t select{width:auto;padding:4px 8px;font-size:13px}
.rl-t td:first-child{overflow-wrap:anywhere}
.rl-rt td:first-child{white-space:nowrap}
#rlList{margin-bottom:14px}
.set-moved{display:flex;justify-content:space-between;align-items:center;gap:12px 20px;flex-wrap:wrap}.set-moved h2{margin:0}.set-moved p{margin:4px 0 0;color:var(--label);font-size:13.5px}
.set-moved>div+div{display:flex;gap:18px;flex-wrap:wrap}
#rlMail span:not(.bdg){font-size:13px}
/* Messages › From names and templates */
.cm-set{display:block;margin:0 18px 12px;border:0;background:transparent;padding:0;color:var(--accent);font-size:13px;font-weight:500;text-align:left}.cm-set:hover{text-decoration:underline}
.set-froms{min-height:130px;font-size:14px}
.set-tpl{display:flex;flex-direction:column;gap:10px}
.set-t{border:1px solid var(--line);border-radius:6px;padding:10px 12px;background:var(--soft);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px}
.set-t input{font:600 13.5px "IBM Plex Mono",ui-monospace,Consolas,monospace;text-transform:uppercase}
.set-t textarea{grid-column:1/-1;min-height:70px;font:13px/1.45 "IBM Plex Mono",ui-monospace,Consolas,monospace;text-transform:uppercase}
.set-t .b{display:flex;gap:4px}.set-t .b button{padding:4px 9px;font-size:12.5px}

/* ---------- Reports ---------- */
#otNeed[aria-pressed=true]{background:var(--teal);border-color:var(--teal);color:#fff}

/* ---------- Flight Watch: the open flight takes the side ---------- */
main#live{grid-template-columns:minmax(0,1fr) 440px}
.lv-side.sel>.fw,.lv-side.sel>.lv-sum,.lv-side.sel>.lv-list{display:none!important}
.lv-side.sel .lv-det{margin-top:0;border-top:0}
.lv-back{display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;color:var(--accent);padding:0 0 10px;font-size:13.5px}
.lv-back svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.lv-f .fo-x{font:600 11px "IBM Plex Mono",ui-monospace,Consolas,monospace;margin-left:8px;color:var(--label)}
.lv-f .fo-x.late{color:var(--red)}
.fo{display:flex;flex-direction:column;gap:0;margin-top:16px}
.fo-s{border-top:1px solid var(--line);padding:14px 0 4px}
.fo-s h4{margin:0 0 10px;font:600 11px Jost,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--bronze);display:flex;align-items:center;gap:8px}
.fo-s h4 small{font:500 11px Jost,system-ui,sans-serif;letter-spacing:0;text-transform:none;color:var(--label)}
.fo-t{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border:1px solid var(--line);border-radius:6px;overflow:hidden}
.fo-t>div{padding:7px 6px;text-align:center;border-left:1px solid var(--line)}.fo-t>div:first-child{border-left:0}
.fo-t span{display:block;font:600 10px Jost,system-ui,sans-serif;letter-spacing:.08em;color:var(--label)}
.fo-t b{display:block;font:500 13px "IBM Plex Mono",ui-monospace,Consolas,monospace;margin-top:2px}
.fo-t .no b{color:var(--off)}.fo-t .sch{background:var(--soft)}
@media(max-width:420px){.fo-t{grid-template-columns:repeat(3,minmax(0,1fr))}.fo-t>div:nth-child(3n+1){border-left:0}.fo-t>div:nth-child(n+4){border-top:1px solid var(--line)}}
.fo-d{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:13px;color:var(--label)}.fo-d b{color:var(--ink);font-weight:500}
.fo-d .late{color:var(--red);font-weight:600}.fo-d .ok{color:var(--green);font-weight:600}
.fo-r{display:flex;gap:8px;align-items:center;margin-top:10px}.fo-r label{margin:0;font-size:12.5px;white-space:nowrap}.fo-r select{padding:6px 8px;font-size:13px}
.fo-g{display:grid;grid-template-columns:78px minmax(0,1fr) auto;gap:1px 10px;align-items:center;padding:7px 0;border-top:1px dashed var(--line)}.fo-g:first-of-type{border-top:0}
.fo-g .k{font-size:12px;color:var(--label)}.fo-g .k b{display:block;font:600 13px "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--ink)}
.fo-g .v{font-weight:600}.fo-g.none .v{font-weight:400;color:var(--label)}
.fo-g small{display:block;font-size:12px;color:var(--label);font-weight:400}
.fo-g button{padding:4px 10px;font-size:12.5px}
.fo-ge{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.fo-ge input{width:auto;flex:1 1 80px;padding:6px 9px;font-size:13.5px;text-transform:uppercase}.fo-ge button{padding:6px 10px;font-size:12.5px}
.fo-ls{font-size:13.5px}.fo-ls .ok{color:var(--green);font-weight:600}.fo-ls small{display:block;color:var(--label);font-size:12px;margin-top:2px}
.fo-a{border-top:1px dashed var(--line);padding:6px 0}.fo-a:first-of-type{border-top:0}
.fo-a summary{cursor:pointer;display:flex;gap:8px;align-items:baseline;list-style:none;font-size:13px}.fo-a summary::-webkit-details-marker{display:none}
.fo-a summary b{font:600 12.5px "IBM Plex Mono",ui-monospace,Consolas,monospace}.fo-a summary time{font:12px "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--label)}.fo-a summary small{margin-left:auto;color:var(--label);font-size:11.5px}
.fo-a pre{margin:6px 0 2px;white-space:pre-wrap;font:12.5px/1.45 "IBM Plex Mono",ui-monospace,Consolas,monospace;background:var(--soft);border-radius:4px;padding:8px 10px}
.fo-ch{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}.fo-ch h4{margin:0}
.fo-c label{margin:10px 0 5px}.fo-c textarea{min-height:96px;font-size:13.5px}
#foBody,#foTitle{text-transform:uppercase;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace}
.fo-c .actions{margin-top:10px;align-items:center}.fo-c .actions a{font-size:13px}
.fo-to{font-size:12px;color:var(--label);margin-top:8px}
@media(max-width:1100px){main#live{grid-template-columns:minmax(0,1fr) 400px}}
@media(max-width:900px){main#live{grid-template-columns:1fr}}
/* polish */
@media(min-width:901px){header{margin-left:-212px}}
body:has(.deny) header{margin-left:0}
.side a:has(#fwN:not([hidden])) #lvCount{display:none}
.fo-c input[type=text],.fo-c select,.fo-c textarea,.fo-r select{padding:7px 10px;font-size:14px}
.fo-c .row{gap:10px}
.ot-bar .help{margin-right:auto}
@media(max-width:600px){.hm-k{display:grid;grid-template-columns:1fr 1fr;width:100%}.hm-c{min-width:0}}

/* ---------- Pilots: the profile beside the list ---------- */
main#pilots.pf{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:24px;align-items:start;max-width:1380px}
.pl-open{border:0;background:transparent;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer;display:inline}
.pl-open:hover b{color:var(--accent);text-decoration:underline}
.pl-t tr.sel td{background:color-mix(in srgb,var(--accent) 9%,transparent)}
.pl-prof{position:sticky;top:83px}
.pf-h{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.pf-h h3{margin:0;font:600 20px "IBM Plex Mono",ui-monospace,Consolas,monospace}.pf-h .meta{color:var(--label);font-size:13px;margin-top:3px}
.pf-st{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
.pl-prof .fo-s{margin-top:14px}
.pf-t{width:100%;border-collapse:collapse;font-size:13px}.pf-t td{padding:6px 4px;border-top:1px dashed var(--line);white-space:nowrap}.pf-t tr:first-child td{border-top:0}.pf-t td.m{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace}
.pf-m{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:baseline;padding:6px 0;border-top:1px dashed var(--line);font-size:13.5px}.pf-m:first-of-type{border-top:0}
.pf-m>span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pf-m time{font-size:12px;color:var(--label);white-space:nowrap}
.pf-d{font-weight:700;width:14px;text-align:center}.pf-d.ok{color:var(--green)}.pf-d.no{color:var(--label)}
.pf-p{margin:0;font-size:14px}
@media(max-width:1100px){main#pilots.pf{grid-template-columns:1fr}.pl-prof{position:static}}
/* ---------- Documents: who has read ---------- */
.dc-ack{grid-column:2/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--label);margin-top:4px}
.dc-ab b{color:var(--ink)}.dc-all{color:var(--green);font-weight:600}
.lkb{border:0;background:transparent;padding:0;color:var(--accent);font-size:12.5px;text-decoration:underline;cursor:pointer}
.dc-who{flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.dc-p{display:inline-flex;align-items:baseline;gap:6px;padding:3px 10px;border:1px solid var(--line);border-radius:14px;background:var(--bg);font-size:12.5px;color:var(--ink)}
.dc-p small{color:var(--label);font-size:11.5px}.dc-p.old{border-style:dashed}
main#pilots.pf .pl-t th:nth-child(3),main#pilots.pf .pl-t td:nth-child(3),main#pilots.pf .pl-t th:nth-child(5),main#pilots.pf .pl-t td:nth-child(5){display:none}
/* ACCEPT: where an AOC message stands on the flight deck */
.ak{display:inline-block;font:600 11px/1.5 inherit;letter-spacing:.03em;padding:0 7px;border-radius:9px;border:1px solid var(--line);color:var(--label);white-space:nowrap;vertical-align:1px}
.ak.ok{border-color:transparent;background:var(--ok-bg);color:var(--green)}
.ak.late{border-color:transparent;background:color-mix(in srgb,#D98A00 20%,transparent);color:#9A5B00}
:root[data-theme="dark"] .ak.late{color:#F2C94C}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .ak.late{color:#F2C94C}}
.cm-i .meta .ak{margin-right:7px}
.fo-a summary .ak,.fo-ls .ak{margin-left:6px}
.fo-a summary small{margin-left:auto}
.ak-h{margin:16px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--label)}
.ak-l{display:grid;gap:5px;font-size:13px}
.ak-l>div{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.ak-l b{font:600 12.5px "IBM Plex Mono",ui-monospace,Consolas,monospace;min-width:74px}
.ak-l small{color:var(--label);font-size:12px}
.fo-a .ak-l{margin:6px 0 4px}
.ak.rej{border-color:transparent;background:color-mix(in srgb,var(--red) 16%,transparent);color:var(--red)}
/* ---------- Nav Data ---------- */
#navdata{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;max-width:1280px}
#ndAll{margin-left:8px}
#ndList{display:grid;gap:16px}
#navdata[hidden]{display:none}
.nd-top .pg-h{flex-wrap:wrap}
.nd-sum{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.nd-sum i{font:600 12px Jost,system-ui,sans-serif;font-style:normal;padding:3px 9px;border-radius:10px;background:var(--soft);color:var(--label)}
.nd-sum i.ok{background:var(--ok-bg);color:var(--green)}
.nd-sum i.warn{background:color-mix(in srgb,#D98A00 18%,transparent);color:#9A5B00}
.nd-sum i.bad,.nd-sum i.warn{cursor:pointer}
.nd-sum i.bad{background:color-mix(in srgb,var(--red) 15%,transparent);color:var(--red)}
.nd-cyc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.nd-cyc>div{border:1px solid var(--line);border-radius:6px;padding:10px 14px;display:grid;gap:2px}
.nd-cyc span{font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--label)}
.nd-cyc b{font:600 22px "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--ink)}
.nd-cyc small{color:var(--label);font-size:12.5px}
.nd-prog{display:grid;gap:6px;margin:4px 0 12px}
.nd-prog[hidden]{display:none}
.nd-bar{position:relative;height:6px;border-radius:3px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.nd-bar i{position:absolute;top:0;bottom:0;left:0;border-radius:3px;background:var(--accent);transition:width .4s ease,left .4s ease}
.nd-bar i.c{opacity:.35;animation:ndPulse 1.2s ease-in-out infinite}
.nd-bar.end i{background:var(--green)}
@keyframes ndPulse{50%{opacity:.12}}
.nd-pl{display:flex;gap:4px 10px;align-items:baseline;flex-wrap:wrap;font-size:13px;color:var(--ink)}
.nd-pl b{font:600 13px Jost,system-ui,sans-serif;font-variant-numeric:tabular-nums}
.nd-pl small{color:var(--label);font-size:12.5px}
.nd-pl .no{color:var(--red)}
.nd-c.chkg{outline:2px solid color-mix(in srgb,var(--accent) 50%,transparent);outline-offset:-1px}
@media(prefers-reduced-motion:reduce){.nd-bar i{transition:none}.nd-bar i.c{animation:none}}
.nd-rm{border:1px solid var(--line);border-radius:6px;padding:10px 14px;display:grid;gap:6px;margin-top:12px}
.nd-rm .rm-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.nd-rm .rm-h span{font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--label)}
.nd-rm .rm-h button{margin-left:auto}
.nd-rm p{margin:0;font-size:13px;color:var(--ink)}.nd-rm p small{color:var(--label);font-size:12.5px}
.nd-rm .rm-to{display:flex;flex-wrap:wrap;gap:6px}.nd-rm .rm-to i{font-style:normal;font-size:12.5px;padding:2px 9px;border-radius:10px;background:var(--soft);color:var(--ink)}
.nd-rm .rm-to i.no{background:color-mix(in srgb,var(--red) 15%,transparent);color:var(--red)}
.nd-rm .rm-warn{color:#9A5B00}.nd-rm .rm-bad{color:var(--red)}
.nd-reg h3{margin:0 0 12px;font:500 18px Georgia,serif;color:var(--ink);display:flex;align-items:baseline;gap:8px}
.nd-reg h3 small{font:500 12.5px Jost,system-ui,sans-serif;color:var(--label)}
.nd-reg.attn{border-color:color-mix(in srgb,var(--red) 35%,var(--line))}
.nd-reg.attn h3{color:var(--red)}
.nd-flt{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:6px}
.nd-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;flex:1 1 auto;min-width:0}
.nd-tabs::-webkit-scrollbar{display:none}
.nd-tabs button{flex:none;display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:15px;border:1px solid var(--line);background:transparent;color:var(--label);font-size:13px;white-space:nowrap}
.nd-tabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:600}
.nd-tabs button i{font:600 11.5px Jost,system-ui,sans-serif;font-style:normal;opacity:.8}
.nd-tabs button b{font:600 10.5px Jost,system-ui,sans-serif;min-width:17px;height:17px;padding:0 5px;border-radius:9px;display:inline-grid;place-items:center;background:var(--red);color:var(--bg)}
.nd-tabs button.attn:not([aria-selected=true]){color:var(--red);border-color:color-mix(in srgb,var(--red) 40%,var(--line))}
.nd-tabs button[aria-selected=true] b{background:var(--bg);color:var(--red)}
#ndQ{flex:0 1 230px;min-width:150px;padding:6px 10px;font-size:13px}
.nd-cty{font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--label)}
.nd-none{color:var(--label);font-size:14px;margin:0}
@media(max-width:640px){#ndQ{flex:1 1 100%}}
.nd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.nd-c{border:1px solid var(--line);border-left:4px solid var(--line);border-radius:6px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;min-width:0;transition:box-shadow .3s}
.nd-c.ok{border-left-color:var(--green)}.nd-c.warn{border-left-color:#E5A00D}.nd-c.bad{border-left-color:var(--red)}.nd-c.off{border-left-color:var(--line)}
.nd-c.flash{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 40%,transparent)}
.nd-h{display:flex;align-items:center;gap:8px}.nd-h b{font-size:15px;flex:1;min-width:0}
.nd-st{font:600 11px Jost,system-ui,sans-serif;padding:1px 8px;border-radius:9px;background:var(--soft);color:var(--label);white-space:nowrap}
.nd-st.ok{background:var(--ok-bg);color:var(--green)}
.nd-st.warn{background:color-mix(in srgb,#D98A00 18%,transparent);color:#9A5B00}
.nd-st.bad{background:color-mix(in srgb,var(--red) 15%,transparent);color:var(--red)}
:root[data-theme="dark"] .nd-st.warn,:root[data-theme="dark"] .nd-sum i.warn{color:#F2C94C}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .nd-st.warn,:root:not([data-theme="light"]) .nd-sum i.warn{color:#F2C94C}}
.nd-by{font-size:12.5px;color:var(--label)}.nd-by a{color:var(--accent);text-decoration:none}.nd-by a:hover{text-decoration:underline}
.nd-line{margin:2px 0 0;font-size:14px;font-weight:500;color:var(--ink)}
.nd-c.bad .nd-line{color:var(--red)}
.nd-rows{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 10px;margin:2px 0 0;font-size:12.5px}
.nd-rows dt{color:var(--label)}.nd-rows dd{margin:0;color:var(--ink);font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:12px;overflow-wrap:anywhere}
.nd-what{margin:0;font-size:12.5px;color:var(--label)}
.nd-f{display:flex;align-items:center;gap:10px;margin-top:auto;padding-top:6px;border-top:1px dashed var(--line)}
.nd-f small{flex:1;min-width:0;color:var(--label);font-size:11.5px}
.nd-f button{padding:4px 12px;font-size:12.5px}
.nd-c#nd-cn-aip,.nd-c#nd-jp-aip,.nd-c#nd-jp-charts{grid-column:1/-1}
.nd-jc{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;max-height:132px;overflow:auto}
.nd-jc span{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border:1px solid var(--line);border-radius:5px;font-size:12px}
.nd-jc b{font:600 12px "IBM Plex Mono",ui-monospace,Consolas,monospace}
.nd-jc i{font-style:normal;font-size:11px;color:var(--accent)}
.nd-cyl{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:6px}
.nd-cyl li{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px 12px;padding:8px 10px;border:1px solid var(--line);border-radius:5px}
.nd-cyl li>div{display:flex;align-items:center;gap:8px}
.nd-cyl li b{font:600 14px "IBM Plex Mono",ui-monospace,Consolas,monospace}
.nd-cyl li small{grid-column:1;color:var(--label);font-size:12px;overflow-wrap:anywhere}
.nd-cyl li .nd-x{grid-column:2;grid-row:1/3;padding:3px 10px;font-size:12px}
.nd-tag{font:600 11px Jost,system-ui,sans-serif;padding:1px 8px;border-radius:9px;background:var(--soft);color:var(--label)}
.nd-cyl li.use .nd-tag{background:var(--ok-bg);color:var(--green)}
.nd-cyl li.later .nd-tag{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.nd-cyl li.old{opacity:.7}
.nd-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;margin-top:4px;padding:18px 14px;border:1.5px dashed color-mix(in srgb,var(--label) 55%,transparent);border-radius:6px;text-align:center;cursor:pointer;transition:background .15s,border-color .15s}
.nd-drop input,.nd-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.nd-drop b{font-size:14px;color:var(--ink)}.nd-drop small{font-size:12px;color:var(--label)}
.nd-drop:hover,.nd-drop:focus-within{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 5%,transparent)}
.nd-drop.over{border-color:var(--accent);border-style:solid;background:color-mix(in srgb,var(--accent) 10%,transparent)}
.nd-drop.busy{cursor:progress;border-style:solid;background:var(--soft)}
.nd-c .msg{margin-top:2px;font-size:13px}
@media(max-width:700px){.nd-cyc{grid-template-columns:1fr}.nd-sum{margin-left:0;width:100%}}
/* Automatic messages › wording */
.at-f{display:grid;gap:5px;min-width:0}
.at-l{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--label)}
.at-tk{display:grid;gap:6px}
.at-tk>div{display:flex;flex-wrap:wrap;gap:5px}
.at-tk button{font:12px "IBM Plex Mono",ui-monospace,Consolas,monospace;padding:4px 7px;border:1px solid var(--line);border-radius:4px;background:var(--soft);color:var(--ink);cursor:pointer}
.at-pv{display:grid;gap:5px;min-width:0}
.at-card{padding:16px 18px;border-radius:14px;background:#1C1C1F;color:#F4F4F5;border:1px solid #3A3A3F;min-width:0}
.at-card b{display:block;font:400 15px/1.3 "Helvetica Neue",Helvetica,Arial,sans-serif;color:#E07FB2;text-transform:uppercase;margin-bottom:10px;word-break:break-word}
.at-card pre{margin:0;font:12.5px/1.35 "IBM Plex Mono",ui-monospace,Consolas,monospace;white-space:pre;overflow-x:auto;text-transform:uppercase}
.at-card pre.err{color:#FF8A8A;text-transform:none}

/* ---------- Phones (Nov 2026) ---------- */
@media(max-width:600px){
 main{padding:12px;gap:12px}
 section{padding:16px}
 /* Home: the clock above, the four figures two by two across the card */
 .hm-bar{flex-direction:column;align-items:stretch;gap:12px;padding:14px 16px}
 .hm-clock{min-width:0;flex-direction:row;align-items:baseline;gap:10px;flex-wrap:wrap}
 .hm-clock b{font-size:26px}
 .hm-k{flex:none;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}
 .hm-c{min-width:0;padding:9px 12px}
 .hm-c b{font-size:22px}
 .hm-col{gap:12px}
 /* a ? explanation opens across the page, not off its right edge */
 .help{position:static}.help>div{position:static;top:auto;left:12px;right:12px;width:auto;margin-top:8px}
 /* wide tables scroll sideways with the pilot or date column kept in view */
 .pl-t th:first-child,.pl-t td:first-child,.ot-tb th:first-child,.ot-tb td:first-child{position:sticky;left:0;z-index:1;background:var(--bg)}
}
@media(max-width:900px){
 /* Messages: no empty reading pane under the list; what is opened is scrolled to, clear of the bars at the top */
 .cm-main:has(#cmEmpty:not([hidden])){display:none}
 #ibView,#cmItem,#cmCompose{scroll-margin-top:118px}
}

/* ---------- Roles (Nov 2026): what a role may not see or change is not offered (the server checks it as well) ---------- */
html.no-p-fw .side a[data-tab="fw"],html.no-p-bc .side a[data-tab="bc"],html.no-p-gates .side a[data-tab="gates"],html.no-p-reports .side a[data-tab="reports"],html.no-p-navdata .side a[data-tab="navdata"],html.no-p-pilots .side a[data-tab="pilots"],html.no-p-cal .side a[data-tab="cal"],html.no-p-comms .side a[data-tab="comms"],html.no-p-docs .side a[data-tab="docs"],html.no-p-settings .side a[data-tab="auto"],html.no-a-roles .side a[data-tab="settings"],html.no-p-settings .au-lk{display:none!important}
html.no-a-msg :is([data-cmnew],[data-edit],[data-del],[data-acdel],[data-ibdone],.ib-r,[data-fwaoc],.fo-c,[data-plmail]){display:none!important}
html.no-a-gates :is(#stSave,[data-st],[data-strm],[data-stup],[data-sted],[data-staadd],[data-stchg],[data-stsend],[data-fog],.fo-ge,.gp-a,.gt-act){display:none!important}
html.no-a-delay :is([data-otr],#foReason){pointer-events:none;opacity:.6}
html.no-a-cal :is([data-ca="new"],[data-ca="newday"],[data-ca="edit"],[data-ca="dup"],[data-ca="del"],[data-ca="save"],[data-ca="vsave"],[data-ca="addp"],[data-carm]){display:none!important}
html.no-a-docs :is(main#docs>section:first-child,[data-dcedit],[data-dcrep]){display:none!important}
html.no-a-docsdel [data-dcdel]{display:none!important}
html.no-a-pilots [data-plout]{display:none!important}
html.no-a-navdata :is(.nd-drop,[data-ndchk],#ndAll,[data-ndcndel],#ndRmTest){display:none!important}
html.no-a-settings :is([data-ausave],[data-aureset],#setSave,#setTplAdd,[data-setrm],[data-setup]){display:none!important}
html.no-a-settings :is(#auto .au-ed,#cmSet) :is(input,select,textarea,[data-attk]){pointer-events:none;opacity:.7}
html.no-a-settings #auto .au-sw input{pointer-events:none;opacity:.55}
.rl-note{font-size:13px;color:var(--label);margin:0 0 6px}
.rl-h{font:600 12px Jost,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--label);margin:18px 0 4px}
.rl-add{display:flex;gap:8px;flex-wrap:wrap}.rl-add input{flex:1 1 220px;width:auto}.rl-add select{width:auto}
.rl-ed{border:1px solid var(--accent);border-radius:8px;padding:14px 16px;margin:4px 0 10px;background:var(--soft)}
.rl-ed label.n{margin-top:0}.rl-ed input[type=text]{max-width:340px}
.rl-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 14px;margin:4px 0 6px}
.rl-g.acts{grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.rl-c{display:flex;gap:8px;align-items:flex-start;margin:0;padding:5px 0;font-size:13.5px;text-transform:none;letter-spacing:0;color:var(--ink);cursor:pointer}
.rl-c input{margin-top:3px}.rl-c small{display:block;color:var(--label);font-size:12px}
.rl-ed .actions{margin-top:12px}
@media(max-width:600px){.rl-g:not(.acts){grid-template-columns:1fr 1fr}}
/* Broadcast (Nov 2026): the live broadcast desk */
main#bc{display:block;max-width:1480px}main#bc[hidden]{display:none!important}
#bc>section,#bc>.bc-cols{margin-bottom:18px}
.bc-top .pg-h{flex-wrap:wrap;margin:0}.bc-top .pg-h>#bcSetB{margin-left:auto}
.bc-st{display:flex;flex-wrap:wrap;gap:6px;margin-left:6px}
.bc-c{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;border-radius:999px;padding:3px 10px;background:var(--soft);border:1px solid var(--line);color:var(--label);white-space:nowrap}
.bc-c i{width:8px;height:8px;border-radius:50%;background:var(--off);flex:none}
.bc-c.ok i{background:#30A46C}.bc-c.warn i{background:#E2A336}.bc-c.bad i{background:#E5484D}
.bc-c.air{background:#E5484D;border-color:#E5484D;color:#fff;font-weight:600;letter-spacing:.04em;font-variant-numeric:tabular-nums}.bc-c.air i{background:#fff;animation:bcp 1.6s ease-in-out infinite}
@keyframes bcp{50%{opacity:.3}}
.bc-set{border-top:1px solid var(--line);margin-top:16px;padding-top:4px}
.bc-set>.au-sw{margin:14px 0 4px}
.bc-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:0 16px}
.bc-set .actions{margin-top:14px}
.bc-url{margin-top:18px;padding-top:4px;border-top:1px solid var(--line)}
.bc-urlr{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.bc-urlr input{flex:1 1 320px;width:auto;font:13px "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--label)}
.bc-urlr a{font-size:13.5px;color:var(--accent)}
.bc-mon{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:20px;align-items:start}
.bc-cap{display:flex;align-items:center;gap:10px;margin-bottom:8px;min-width:0;min-height:24px}.bc-cap b{flex:none;font:600 12px Jost,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--label)}
.bc-cap span{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.bc-cap em{flex:none;font-style:normal;font:600 11px Jost,system-ui,sans-serif;letter-spacing:.1em;background:#E5484D;color:#fff;border-radius:4px;padding:2px 7px;margin-left:auto}
.bc-fr{position:relative;display:block;aspect-ratio:16/9;background:#000;border-radius:6px;overflow:hidden}
.bc-fr img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.bc-ph{position:absolute;inset:0;display:grid;place-items:center;color:#8E8E93;font-size:13px;text-align:center;padding:10px}
.bc-pgm.air .bc-fr{box-shadow:0 0 0 3px #E5484D}.bc-pvw .bc-fr.pv{box-shadow:0 0 0 3px #30A46C}
.bc-take{display:flex;gap:10px;margin-top:14px}.bc-take #bcTake{flex:1;font-size:18px;font-weight:600;letter-spacing:.14em;padding:14px}
.bc-take #bcTake:disabled{opacity:.45;cursor:default}.bc-take #bcBrb{padding:14px 16px}
.bc-pvw .hint{margin-top:8px}
.bc-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-top:12px}
.bc-tile{padding:0;text-align:left;background:var(--soft);border:2px solid var(--line);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;font-weight:400}
.bc-tile .bc-fr{border-radius:0}.bc-tile:hover{border-color:var(--accent)}
.bc-tile.on{border-color:#E5484D}.bc-tile.pv{border-color:#30A46C}
.bc-tn{display:flex;align-items:center;gap:8px;padding:7px 10px;font-size:13.5px;font-weight:500;min-width:0}
.bc-tn i{font-style:normal;flex:none;width:20px;height:20px;border-radius:4px;background:var(--mist);color:var(--label);font:600 12px/20px Jost,system-ui,sans-serif;text-align:center}
.bc-tn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bc-tag{position:absolute;left:8px;top:8px;font:600 10.5px Jost,system-ui,sans-serif;letter-spacing:.08em;border-radius:4px;padding:2px 6px;color:#fff;background:#E5484D}.bc-tag.pv{background:#30A46C}
/* Polaris Cam: the cockpit cameras, 2 × 2 (one large when picked) */
.bc-cam .lh{justify-content:flex-start}.bc-cam .bc-st{margin-left:0}
.bc-cg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
.bc-cg.one{grid-template-columns:minmax(0,1fr)}.bc-cg.one .bc-cc:not(.z){display:none}
.bc-cc{display:block;width:100%;padding:8px;text-align:left;background:var(--soft);border:1px solid var(--line);border-radius:8px;font-weight:400;color:var(--ink);cursor:zoom-in}
.bc-cc:hover{border-color:var(--accent)}.bc-cg.one .bc-cc{cursor:zoom-out}
.bc-cc canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.bc-cc .bc-cap em{background:none;color:var(--label);font-weight:500;letter-spacing:0;padding:0;font-variant-numeric:tabular-nums}
@media(max-width:600px){.bc-cg{grid-template-columns:minmax(0,1fr)}}
.bc-c.bc-src{background:color-mix(in srgb,var(--accent) 12%,transparent);border-color:color-mix(in srgb,var(--accent) 40%,transparent);color:var(--ink);font-weight:600}
/* Flight Watch: who has Polaris Cam on, and the open flight's Cockpit Monitor (the camera grid as Broadcast's, smaller) */
.fw-cam{padding:10px 16px}.fw-cps{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.fw-cp{display:inline-flex;align-items:center;gap:6px;margin:0;padding:3px 10px 3px 8px;height:auto;border-radius:999px;font-size:12.5px;font-weight:500;background:var(--soft);border:1px solid var(--line);color:var(--ink)}
.fw-cp:hover{border-color:var(--accent)}.fw-cp.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.fw-cp i,.fw-cb i{width:7px;height:7px;border-radius:50%;background:#30A46C;flex:none}
.fw-cp b{font:600 12px "IBM Plex Mono",ui-monospace,Consolas,monospace}.fw-cp small{color:var(--label);font-size:11.5px}
.fw-camg{max-height:none;padding:0 16px 12px}.fw-camg .fo-s{border-top:0;padding-top:10px}
.lv-f .fw-cb{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:1px 6px;border-radius:4px;font:600 10px Jost,system-ui,sans-serif;letter-spacing:.08em;color:var(--green);background:color-mix(in srgb,#30A46C 14%,transparent);vertical-align:2px}
.fo-camh{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.fo-camh h4{margin:0}
.fo-camb{display:flex;gap:4px}.fo-camb button{margin:0;padding:3px 10px;font-size:12px;height:26px}
.fo-camst{margin-left:0}.fo-cg{gap:8px;margin-top:10px}.fo-cg .bc-cc{padding:6px}
.fo-cg .bc-cap{gap:6px;margin-bottom:6px;min-height:18px}.fo-cg .bc-cap b{font-size:10.5px}.fo-cg .bc-cap span{font-size:12.5px}.fo-cg:not(.one) .bc-cap em{display:none}
@media(max-width:600px){.fo-cg,.fo-cg.one{grid-template-columns:minmax(0,1fr)}}
/* one camera on: that camera, large (the others are not drawn) */
.bc-cg.solo{grid-template-columns:minmax(0,1fr)}.bc-cg.solo .bc-cc[hidden]{display:none}.bc-cg.solo:not(.one) .bc-cc{cursor:default}
.fo-camk{margin-top:10px}.fo-camk summary{cursor:pointer;font-size:12.5px;color:var(--accent)}.fo-camk .bc-urlr{margin-top:8px}.fo-camk .bc-urlr input{flex:1 1 200px;font-size:12px}
.fo-camhint{margin:8px 0 0}
.bc-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start}
@media(max-width:1180px){.bc-cols{grid-template-columns:1fr 1fr}}
@media(max-width:900px){.bc-mon,.bc-cols{grid-template-columns:1fr}}
.bc-ovs .au-sw{margin:12px 0}
.bc-auto .lh .au-sw{flex:none}
.bc-rule{display:grid;grid-template-columns:86px minmax(0,1fr);gap:8px;align-items:center;padding:6px 8px;border-radius:6px;margin:0 -8px}
.bc-rule.now{background:color-mix(in srgb,var(--accent) 13%,transparent)}
.bc-rule>b{font-size:13px;font-weight:500}.bc-rule.now>b{color:var(--accent)}
.bc-chips{display:flex;flex-wrap:wrap;gap:5px;align-items:center;min-width:0}
.bc-chip{display:inline-flex;align-items:center;gap:2px;font-size:12.5px;background:var(--mist);border-radius:999px;padding:2px 3px 2px 10px;max-width:100%}
.bc-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bc-chip button{border:0;background:none;padding:0 6px;font-size:15px;line-height:1;color:var(--label)}
.bc-chips select{width:auto;max-width:150px;padding:3px 6px;font-size:12.5px}
.bc-chips .none{font-size:12.5px;color:var(--label)}
.bc-auto label[for=bcEvery]{margin-top:12px}.bc-auto #bcEvery{width:auto;padding:5px 9px;font-size:13.5px}
.bc-fh{font-weight:500;margin:0 0 2px}.bc-fh b{font:600 16px "IBM Plex Mono",ui-monospace,Consolas,monospace;margin-right:8px}
.bc-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px 14px;margin:12px 0}
.bc-kv small{display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--label)}.bc-kv b{font:500 19px Jost,system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
.bc-kv b i{font-style:normal;font-size:12px;color:var(--label);margin-left:3px}
.bc-oo{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13.5px;color:var(--label)}.bc-oo b{color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}
.bc-hr{display:flex;align-items:center;gap:9px;padding:7px 0;border-top:1px solid var(--line);font-size:13.5px}.bc-hr:first-child{border-top:0}
.bc-hr i{width:9px;height:9px;border-radius:50%;flex:none;background:var(--off)}.bc-hr.ok i{background:#30A46C}.bc-hr.warn i{background:#E2A336}.bc-hr.bad i{background:#E5484D}
.bc-hr span{color:var(--label);flex:1;min-width:0}.bc-hr b{font-weight:500;text-align:right}
.bc-em button{display:block;width:100%;margin:0 0 8px;text-align:left}
.bc-em button.arm{background:#E5484D;border-color:#E5484D;color:#fff}
.bc-em button:disabled{opacity:.5;cursor:default}
.bc-em .hint{margin:4px 0 0}
#bcLog{max-height:360px;overflow-y:auto}
.bc-l{font-size:13px;padding:6px 0;border-top:1px solid var(--line);display:grid;grid-template-columns:50px minmax(0,1fr);gap:8px}.bc-l:first-child{border-top:0}
.bc-l time{color:var(--label);font-variant-numeric:tabular-nums}.bc-l small{display:block;color:var(--label);font-size:12px}
.bc-sm{padding:5px 11px;font-size:13px}
html.no-a-live #bc .bc-act{pointer-events:none;opacity:.5}
/* ---------- iPad, phones and the EFB's Admin app (P1, Nov 2026) ---------- */
:root{--hdr:59px;--navh:0px}
/* Flight Watch: the open flight while it is missing from an update (admin-live, GRACE) */
.lv-lost{margin:0 0 10px;padding:6px 10px;border-radius:6px;background:color-mix(in srgb,#E5A00D 14%,transparent);color:var(--ink);font-size:12.5px}
/* Nav Data's filter bar sticks under the header (and the sections bar on a narrow screen), never behind them */
.nd-flt{top:var(--hdr)}
/* a ? explanation is never cut off: it scrolls within itself */
.help>div{max-height:min(70dvh,420px);overflow:auto;overscroll-behavior:contain}
/* Broadcast: where the pictures come from, and the way to the link */
.bc-src-go{margin-left:4px;padding:2px 9px;font-size:12px;min-height:0}
/* targets: at least 36 px to press on a desktop (the small ones reach past their edges, so nothing moves), 44 px on a
   touch screen or a narrow window */
.help>summary,.bc-chip button,.fw-b button,.fo-camb button,.lv-dbtn button,.fo-g button,.fw-cp{position:relative}
.help>summary::after{content:"";position:absolute;inset:-7px;border-radius:50%}
.bc-chip button::after,.fw-b button::after,.fo-camb button::after,.lv-dbtn button::after,.fo-g button::after,.fw-cp::after{content:"";position:absolute;left:-2px;right:-2px;top:50%;height:36px;transform:translateY(-50%)}
.gm-z button{width:36px;height:36px}
@media(pointer:coarse),(max-width:900px){
 .help>summary{width:32px;height:32px}
 .fw-b button,.fo-camb button,.lv-dbtn button,.fo-g button,.fo-ge button,.bc-src-go{min-height:44px;height:auto}
 .lv-back{min-height:44px;padding-bottom:0;margin-bottom:6px}
 .fw-cp{min-height:36px}
 .bc-chip button{min-width:36px;min-height:36px}
 .bc-chip button::after,.fw-b button::after,.fo-camb button::after,.lv-dbtn button::after,.fo-g button::after,.fw-cp::after{height:44px}
 .gm-z button{width:44px;height:44px}
}
@media(max-width:900px){
 /* the sections bar under the header: 44 px tabs, and a fade at an edge with more tabs past it (sideScroll) */
 :root{--navh:53px}
 html{scroll-padding-top:calc(var(--hdr) + var(--navh))}
 /* (the page keeps clear of the two bars itself now: what is scrolled to needs no room of its own for them) */
 main{scroll-margin-top:0}#ibView,#cmItem,#cmCompose{scroll-margin-top:8px}
 .side{padding:4px 8px}
 .side a{min-height:44px}
 .side.more-r{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 40px),transparent)}
 .side.more-l{-webkit-mask-image:linear-gradient(to right,transparent,#000 40px);mask-image:linear-gradient(to right,transparent,#000 40px)}
 .side.more-l.more-r{-webkit-mask-image:linear-gradient(to right,transparent,#000 40px,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(to right,transparent,#000 40px,#000 calc(100% - 40px),transparent)}
 .nd-flt{top:calc(var(--hdr) + var(--navh))}
 /* a ? explanation opens in the flow of the page, under its ?, on an iPad as on a phone (not over what follows) */
 .help{position:static}.help>div{position:static;top:auto;left:12px;right:12px;width:auto;margin-top:8px}
}
/* in the EFB's Admin app (a frame): a lower header, and on a narrow screen a shorter map, so the flight list and the open
   flight's panel (the Cockpit Monitor) show without scrolling far */
html.in-efb{--hdr:48px}
html.in-efb header{padding:0 14px;gap:10px}html.in-efb .brand .logo{height:24px}html.in-efb .brand span{font-size:18px}
@media(max-width:900px){html.in-efb main#live{grid-template-rows:40dvh auto}}
@media(max-width:900px) and (max-height:500px){html.in-efb main#live{grid-template-rows:60dvh auto}}
</style></head><body>
<header><h1 class="brand"><svg class="logo" role="img" aria-label="Polaris" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15092.484 3905.46"><g id="Asset_30" data-name="Asset 30"><g><g><polygon points="1904.622,369.472 1904.528,119.039 1954.699,370.183 1964.691,420.197 1985.701,525.369 1991.983,556.813 2127.906,1237.207 2133.942,1267.418 2175.221,1474.052 2205.806,1627.151 2208.049,1638.378 2208.289,1639.577 2198.471,1649.418 1928.519,1920.038 1905.275,1943.339 2178.597,1942.992 2196.588,1942.969 2292.604,1942.847 2196.588,1942.97 2178.597,1942.993 1906.108,1943.341 2178.048,1943.816 2196.003,1943.847 3295.655,1945.769 3326.686,1945.823 3434.563,1946.012 3484.213,1946.099 3683.295,1946.447 3684.587,1946.705 3483.711,1987.063 3433.753,1997.1 3324.685,2019.013 3293.253,2025.328 2370.425,2210.733 2203.558,2244.258 2203.422,2244.285 1906.607,1944.744 1905.275,1943.4 1905.275,1944.746 1905.276,1948.056 2078.169,2120.51 1905.276,1948.058 1905.276,1948.076 1905.279,1976.469 1905.303,2220.019 1905.304,2237.983 1905.311,2304.179 1905.313,2327.917 1905.37,2905.996 1905.374,2938.032 1905.412,3331.58 1905.416,3362.611 1905.427,3474.618 1905.432,3524.269 1905.457,3777.46 1905.457,3785.26 1853.82,3523.396 1843.952,3473.349 1821.618,3360.087 1815.411,3328.609 1751.325,3003.61 1745.219,2972.644 1635.127,2414.335 1606.24,2267.839 1601.742,2245.028 1727.244,2119.501 1738.029,2108.715 1773.427,2073.31 1773.428,2073.309 1881.665,1966.568 1901.925,1946.588 1902.867,1945.659 1902.339,1945.129 1902.869,1945.657 1902.87,1945.656 1903.792,1944.748 1905.217,1943.342 1905.216,1941.439 1905.109,1656.963 1905.041,1476.749 1905.026,1436.619 1904.692,554.257 1904.68,523.226 1904.641,419.122" class="lg1"/><polygon points="2227.828,1618.584 2730.499,1115.533 2373.989,1650.044 2228.062,1619.754" class="lg1"/><polygon points="1587.568,1629.093 1092.466,1131.996 1618.458,1485.934 1591.032,1628.415" class="lg1"/><polygon points="1607.337,1648.942 1610.829,1648.259 1642.951,1680.457 1666.349,1703.91 1901.939,1940.056 1904.267,1942.389 1905.217,1943.342 1903.319,1943.338 1901.935,1943.335 1900.547,1943.332 1609.751,1942.748 1518.378,1942.564 1427.355,1942.381 1376.003,1942.278 518.334,1940.554 518.334,1940.554 487.303,1940.491 487.303,1940.491 379.079,1940.274 379.079,1940.274 329.428,1940.174 329.428,1940.174 120.047,1939.753 330.136,1898.674 380.144,1888.896 489.267,1867.559 520.684,1861.416 1437.628,1682.125" class="lg1"/><polygon points="1065.16,2781.715 1433.539,2232.373 1581.485,2262.597 1581.522,2262.786 1581.928,2264.846 1068.705,2778.171" class="lg1"/><polygon points="2194.461,2412.427 2222.688,2266.599 2562.141,2607.241 2579.384,2624.545 2708.399,2754.011 2708.869,2754.716 2541.209,2643.154 2518.502,2628.045" class="lg1"/><path d="M1833.036 371.165 L1904.48 0 L1978.611 371.075 L1978.611 371.075 C2290.231 385.035 2578.32 489.409 2817.277 658.595 L2897.526 595.883 L2965.268 544.96 C2965.833 544.535 2966.516 544.293 2967.223 544.269 L2972.062 544.099 C2974.421 544.026 2976.159 546.288 2975.477 548.55 L2974.083 553.173 C2973.879 553.85 2973.472 554.448 2972.916 554.887 L2906.505 607.325 L2831.401 668.712 C3210.137 943.157 3462.108 1381.815 3482.83 1880.202 L3802.989 1946.656 L3482.935 2010.958 C3450.276 2828.268 2795.744 3485.567 1979.572 3522.621 L1979.572 3522.621 L1905.469 3905.46 L1905.469 3905.284 L1905.437 3905.46 L1829.907 3522.427 C1533.482 3508.197 1258.51 3412.145 1027.084 3256.364 L1023.69 3257.226 L965.367 3270.134 L911.981 3279.994 L865.091 3286.778 L823.499 3290.861 L786.009 3292.624 C785.942 3292.627 785.874 3292.628 785.807 3292.627 L753.713 3292.254 C753.635 3292.253 753.556 3292.25 753.478 3292.243 L724.855 3289.953 C724.768 3289.946 724.68 3289.936 724.593 3289.922 L699.049 3285.896 C698.949 3285.881 698.85 3285.86 698.752 3285.836 L676.479 3280.292 C676.363 3280.263 676.248 3280.228 676.136 3280.187 L656.548 3273.086 C656.423 3273.041 656.301 3272.989 656.183 3272.93 L638.933 3264.322 C638.804 3264.258 638.679 3264.185 638.559 3264.105 L623.442 3254.022 C623.307 3253.932 623.179 3253.833 623.059 3253.725 L610.32 3242.359 C610.191 3242.243 610.07 3242.118 609.96 3241.985 L599.246 3229.05 C599.135 3228.915 599.033 3228.772 598.943 3228.622 L590.266 3214.137 C590.178 3213.991 590.101 3213.838 590.036 3213.68 L583.442 3197.702 C583.385 3197.565 583.337 3197.423 583.299 3197.28 L577.254 3174.766 C577.225 3174.658 577.201 3174.548 577.183 3174.438 L573.26 3150.891 C573.242 3150.786 573.229 3150.679 573.222 3150.573 L571.415 3125.638 C571.408 3125.538 571.405 3125.437 571.406 3125.336 L571.806 3098.899 C571.808 3098.808 571.813 3098.716 571.821 3098.625 L574.542 3070.008 C574.55 3069.927 574.56 3069.846 574.574 3069.766 L579.654 3039.367 C579.666 3039.292 579.681 3039.218 579.698 3039.144 L587.304 3006.856 C587.32 3006.787 587.339 3006.72 587.359 3006.653 L597.752 2972.1 C597.769 2972.041 597.789 2971.982 597.81 2971.924 L611.395 2934.195 L628.056 2894.137 L634.771 2879.838 C453.887 2633.63 342.765 2332.984 330.541 2007.039 L0 1939.512 L331.032 1874.785 C367.611 1061.528 1020.002 408.598 1833.036 371.165 Z M1904.528 119.039 L1904.622 369.472 L1904.641 419.122 L1904.68 523.226 L1904.692 554.257 L1905.026 1436.619 L1905.041 1476.749 L1905.109 1656.963 L1905.216 1941.439 L1905.217 1943.342 L1903.792 1944.748 L1902.87 1945.656 L1902.869 1945.657 L1902.339 1945.129 L1902.867 1945.659 L1901.925 1946.588 L1881.665 1966.568 L1773.428 2073.309 L1773.427 2073.31 L1738.029 2108.715 L1727.244 2119.501 L1601.742 2245.028 L1606.24 2267.839 L1635.127 2414.335 L1745.219 2972.644 L1751.325 3003.61 L1815.411 3328.609 L1821.618 3360.087 L1843.952 3473.349 L1853.82 3523.396 L1905.457 3785.26 L1905.457 3777.46 L1905.432 3524.269 L1905.427 3474.618 L1905.416 3362.611 L1905.412 3331.58 L1905.374 2938.032 L1905.37 2905.996 L1905.313 2327.917 L1905.311 2304.179 L1905.304 2237.983 L1905.303 2220.019 L1905.279 1976.469 L1905.276 1948.076 L1905.276 1948.058 L2078.169 2120.51 L1905.276 1948.056 L1905.275 1944.746 L1905.275 1943.4 L1906.607 1944.744 L2203.422 2244.285 L2203.558 2244.258 L2370.425 2210.733 L3293.253 2025.328 L3324.685 2019.013 L3433.753 1997.1 L3483.711 1987.063 L3684.587 1946.705 L3683.295 1946.447 L3484.213 1946.099 L3434.563 1946.012 L3326.686 1945.823 L3295.655 1945.769 L2196.003 1943.847 L2178.048 1943.816 L1906.108 1943.341 L2178.597 1942.993 L2196.588 1942.97 L2292.604 1942.847 L2196.588 1942.969 L2178.597 1942.992 L1905.275 1943.339 L1928.519 1920.038 L2198.471 1649.418 L2208.289 1639.577 L2208.049 1638.378 L2205.806 1627.151 L2175.221 1474.052 L2133.942 1267.418 L2127.906 1237.207 L1991.983 556.813 L1985.701 525.369 L1964.691 420.197 L1954.699 370.183 Z M1905.217 1943.342 L1904.267 1942.389 L1901.939 1940.056 L1666.349 1703.91 L1642.951 1680.457 L1610.829 1648.259 L1607.337 1648.942 L1437.628 1682.125 L520.684 1861.416 L489.267 1867.559 L380.144 1888.896 L330.136 1898.674 L120.047 1939.753 L329.428 1940.174 L329.428 1940.174 L379.079 1940.274 L379.079 1940.274 L487.303 1940.491 L487.303 1940.491 L518.334 1940.554 L518.334 1940.554 L1376.003 1942.278 L1427.355 1942.381 L1518.378 1942.564 L1609.751 1942.748 L1900.547 1943.332 L1901.935 1943.335 L1903.319 1943.338 Z M1988.639 421.274 L2009.737 526.884 C2260.688 544.831 2493.592 628.004 2691.588 759.541 C2697.075 763.186 2702.536 766.869 2707.969 770.588 C3056.86 1009.421 3293.717 1399.946 3323.509 1847.132 L3432.652 1869.786 C3408.69 1387.589 3161.164 964.24 2791.589 701.253 C2786.565 697.677 2781.518 694.132 2776.449 690.616 C2550.597 533.976 2280.474 436.676 1988.639 421.274 Z M1823.374 421.361 C1045.536 463.227 422.32 1086.929 381.222 1864.971 L490.724 1843.56 C539.349 1140.198 1100.299 577.826 1803.045 526.971 Z M2016.048 558.474 L2148.072 1219.346 L2158.689 1209.942 L2315.919 1073.585 L2477.149 936.684 L2635.42 805.161 L2666.326 780.058 C2476.684 655.972 2254.838 577.024 2016.048 558.474 Z M1796.967 558.55 C1116.268 611.907 573.475 1156.085 522.282 1837.389 L1423.751 1661.124 L1038.032 1077.342 L1621.529 1469.976 Z M2683.101 791.209 L2647.999 820.315 L2491.244 953.292 L2331.594 1091.666 L2175.953 1229.439 L2154.045 1249.244 L2196.127 1459.896 L2784.563 1061.426 L2389.779 1653.321 L3291.944 1840.58 C3260.118 1403.651 3026.132 1022.822 2683.101 791.209 Z M2730.499 1115.533 L2227.828 1618.584 L2228.062 1619.754 L2373.989 1650.044 Z M1092.466 1131.996 L1587.568 1629.093 L1591.032 1628.415 L1618.458 1485.934 Z M380.658 2017.277 C394.348 2319.061 495.591 2598.028 659.588 2829.379 C669.202 2842.942 679.032 2856.342 689.073 2869.573 C789.851 3002.369 911.854 3118.175 1050.027 3211.938 L1081.646 3204.199 L1153.505 3184.492 L1195.643 3171.81 C1019.016 3069.348 866.512 2929.899 748.731 2764.063 C739.054 2750.437 729.611 2736.634 720.409 2722.659 C589.699 2524.15 507.463 2290.891 490.55 2039.728 Z M3432.795 2021.031 L3323.213 2043.047 C3274.238 2745.94 2713.609 3307.853 2011.273 3358.841 L1989.286 3472.431 C2770.153 3430.893 3395.419 2802.995 3432.795 2021.031 Z M522.113 2046.176 C539.564 2283.58 616.699 2504.397 738.574 2693.681 L770.783 2644.84 L813.528 2584.563 L862.425 2519.265 L916.992 2449.788 L977.581 2376.026 L1045.333 2296.753 L1119.286 2213.414 L1154.249 2175.316 Z M3291.637 2049.391 L2384.188 2231.706 L2614.597 2582.82 L2781.659 2504.037 L2912.337 2440.633 C2912.905 2440.358 2913.537 2440.243 2914.166 2440.302 L2915.652 2440.44 C2918.178 2440.676 2919.597 2443.462 2918.302 2445.644 L2917.54 2446.927 C2917.218 2447.47 2916.753 2447.914 2916.197 2448.211 L2787.999 2516.657 L2626.324 2600.689 L2762.687 2808.49 L2525.629 2650.75 L2428.721 2697.991 L2252.742 2781.377 L2110.373 2846.858 L2017.386 3327.257 C2697.6 3273.76 3240.022 2730.133 3291.637 2049.391 Z M1199.892 2184.641 L1149.639 2240.528 L1077.015 2324.064 L1010.589 2403.401 L951.316 2477.074 L898.063 2546.314 L850.485 2611.214 L809.057 2670.908 L771.581 2727.474 L766.575 2735.488 C888.346 2910.375 1049.316 3055.928 1236.755 3159.419 L1325.097 3130.673 L1424.384 3096.195 L1532.938 3056.272 L1650.097 3011.021 L1723.245 2981.509 L1614.195 2428.479 L1010.553 2836.334 L1010.633 2836.254 L1010.538 2836.319 L1417.703 2229.138 Z M1433.539 2232.373 L1065.16 2781.715 L1068.705 2778.171 L1581.928 2264.846 L1581.522 2262.786 L1581.485 2262.597 Z M2222.688 2266.599 L2194.461 2412.427 L2518.502 2628.045 L2541.209 2643.154 L2708.869 2754.716 L2708.399 2754.011 L2579.384 2624.545 L2562.141 2607.241 Z M2191.381 2428.34 L2116.783 2813.742 L2241.758 2757.581 L2418.202 2675.858 L2502.774 2635.542 Z M665.204 2919.911 L652.274 2950.246 L639.133 2985.762 C639.112 2985.82 639.092 2985.878 639.073 2985.937 L629.114 3018.028 C629.093 3018.095 629.074 3018.162 629.058 3018.23 L621.818 3047.798 C621.8 3047.872 621.785 3047.946 621.772 3048.021 L616.933 3075.491 C616.919 3075.571 616.908 3075.652 616.899 3075.733 L614.259 3101.134 C614.25 3101.225 614.244 3101.317 614.242 3101.409 L613.694 3124.299 C613.692 3124.399 613.694 3124.5 613.7 3124.601 L615.046 3145.755 C615.052 3145.862 615.064 3145.968 615.081 3146.074 L618.175 3165.713 C618.193 3165.823 618.215 3165.933 618.243 3166.041 L622.9 3184.022 C622.938 3184.166 622.984 3184.307 623.04 3184.445 L627.329 3195.113 C627.393 3195.271 627.468 3195.424 627.555 3195.572 L632.94 3204.752 C633.029 3204.903 633.129 3205.047 633.239 3205.183 L639.88 3213.353 C639.99 3213.487 640.109 3213.613 640.237 3213.73 L648.429 3221.175 C648.549 3221.284 648.676 3221.384 648.81 3221.475 L659.317 3228.621 C659.437 3228.703 659.561 3228.776 659.69 3228.842 L672.474 3235.364 C672.592 3235.425 672.713 3235.478 672.837 3235.524 L688.177 3241.24 C688.289 3241.281 688.403 3241.317 688.519 3241.347 L706.977 3246.115 C707.075 3246.141 707.174 3246.161 707.273 3246.178 L729.511 3249.883 C729.597 3249.898 729.685 3249.909 729.773 3249.917 L755.478 3252.201 C755.556 3252.208 755.635 3252.212 755.714 3252.214 L785.271 3252.816 C785.339 3252.818 785.406 3252.817 785.474 3252.814 L820.81 3251.463 L860.543 3247.913 L905.856 3241.762 L957.921 3232.617 L984.827 3226.908 C864.424 3140.032 756.769 3036.586 665.204 2919.911 Z M1729.392 3012.683 L1661.923 3040.593 L1544.696 3087.052 L1435.958 3128.126 L1336.362 3163.691 L1280.32 3182.471 C1436.068 3261.368 1608.692 3311.773 1791.339 3326.833 Z M1239.198 3196.064 L1163.738 3219.496 L1092.459 3239.716 C1305.247 3374.032 1553.503 3457.265 1820.002 3472.194 L1797.575 3358.458 C1596.898 3343.162 1407.888 3286.146 1239.198 3196.064 Z" class="lg2"/><path d="M3000.794 2368.893 C3019.684 2356.512 3036.552 2302.346 3043.794 2304.444 C3051.037 2306.543 3036.336 2361.337 3045.682 2381.898 C3046.452 2383.592 3046.743 2384.634 3047.449 2385.915 C3048.154 2387.197 3048.879 2388 3049.899 2389.556 C3062.28 2408.446 3116.446 2425.314 3114.348 2432.556 C3112.25 2439.799 3057.455 2425.098 3036.894 2434.444 C3035.2 2435.214 3034.158 2435.505 3032.877 2436.21 C3031.595 2436.916 3030.792 2437.641 3029.236 2438.661 C3010.346 2451.042 2993.478 2505.208 2986.236 2503.11 C2978.994 2501.011 2993.694 2446.217 2984.348 2425.656 C2983.579 2423.962 2983.287 2422.92 2982.582 2421.639 C2981.876 2420.357 2981.151 2419.554 2980.131 2417.998 C2967.75 2399.108 2913.584 2382.24 2915.682 2374.998 C2917.781 2367.755 2972.575 2382.456 2993.136 2373.11 C2994.83 2372.34 2995.872 2372.049 2997.153 2371.343 C2998.435 2370.638 2999.238 2369.913 3000.794 2368.893 Z" class="lg2"/></g><g><path d="M4555.784 993.393 L4555.784 961.588 L4683.02 961.588 L4934.027 961.588 L5346.408 961.588 C5582.591 961.588 5995.111 1060.39 5995.111 1525.597 C5995.111 1990.805 5541.722 2084.342 5376.301 2084.342 L4934.027 2084.342 L4934.027 2914.192 L4683.02 2914.192 L4683.02 1232.257 L4683.02 1210.038 C4681.351 1154.448 4666.195 1012.43 4555.784 993.393 Z M4934.027 1073.435 L4934.027 1975.808 L5314.902 1975.808 C5534.427 1975.808 5726.976 1825.867 5726.976 1525.597 C5726.976 1225.328 5537.677 1073.435 5328.873 1073.435 Z" class="lg1"/><path d="M6162.687 1937.947 C6162.687 1472.577 6440.852 925.218 7110.863 925.218 C7767.08 925.218 8027.952 1535.288 8027.952 1937.947 C8027.952 2489.072 7679.777 2961.465 7110.863 2961.465 C6467.077 2961.465 6162.687 2476.506 6162.687 1937.947 Z M6448.694 1933.731 C6448.694 2320.285 6594.807 2853.968 7110.863 2853.968 C7610.46 2853.968 7738.836 2281.413 7738.836 1939.183 C7738.836 1651.955 7626.485 1038.732 7095.319 1032.975 C6569.967 1027.281 6448.694 1618.896 6448.694 1933.731 Z" class="lg1"/><path d="M8170.885 992.217 L8170.885 961.645 L8297.651 961.645 L8543.494 961.645 L8548.659 961.645 L8548.659 2802.004 L9055.431 2802.004 L9148.53 2802.004 C9180.429 2801.205 9214.392 2799.364 9239.576 2795.465 C9303.429 2785.578 9410.95 2757.976 9449.262 2720.488 L9468.624 2720.488 L9423.065 2914.249 L8548.659 2914.249 L8297.651 2914.249 L8297.651 2802.004 L8297.651 1239.526 C8297.651 1239.517 8297.651 1239.508 8297.651 1239.498 C8297.651 1103.733 8279.43 1068.948 8248.945 1035.58 C8218.46 1002.211 8170.885 992.217 8170.885 992.217 Z" class="lg1"/><path d="M10311.469 1128.699 L10382.399 940.01 L10503.527 940.01 L11104.222 2576.823 L11104.224 2576.829 C11205.069 2850.79 11330.058 2914.192 11330.058 2914.192 L11228.033 2914.192 L11159.889 2914.192 L10966.728 2914.192 L10734.92 2282.546 L9998.851 2282.546 L9828.336 2736.152 C9828.238 2736.414 9828.14 2736.676 9828.04 2736.937 L9828.04 2736.939 L9826.776 2740.301 C9795.609 2824.172 9788.896 2914.192 9788.896 2914.192 L9761.408 2914.192 L9640.28 2914.192 L9620.591 2914.192 C9635.399 2907.37 9687.309 2783.168 9729.607 2676.566 Z M10371.305 1291.746 L10041.619 2168.775 L10693.167 2168.775 Z" class="lg1"/><path d="M11465.356 992.724 L11465.356 963.48 L11595.087 963.48 L11602.195 963.48 L11692.209 963.48 L11733.248 963.48 L11846.094 963.48 L11934.079 963.48 L12247.917 963.48 C12354.113 963.48 12853.407 982.242 12853.407 1491.098 C12853.407 1771.903 12630.249 1965.376 12378.93 1991.644 C12425.995 2015.323 12509.405 2049.548 12625.834 2302.109 C12742.264 2554.669 12763.081 2595.34 12763.081 2595.34 L12763.081 2595.342 C12885.416 2854.193 13026.525 2915.969 13026.525 2915.969 L12816.062 2915.969 L12757.942 2916.006 C12684.954 2916.054 12631.449 2897.849 12556.363 2741 C12481.278 2584.152 12329.616 2256.546 12329.616 2256.546 C12257.186 2102.253 12194.352 2019.939 12097.754 2019.939 L11846.094 2019.939 L11846.094 2916.084 L11595.087 2916.084 L11595.087 1234.203 C11595.087 1027.499 11506.003 1004.289 11465.356 992.724 Z M11846.094 1076.686 L11846.094 1906.732 L12180.947 1906.732 C12286.772 1906.732 12592.858 1842.627 12592.858 1498.398 C12592.858 1257.665 12467.615 1076.686 12204.967 1076.686 L12025.468 1076.686 L12020.709 1076.686 Z" class="lg1"/><path d="M13120.586 992.724 L13120.586 963.48 L13243.325 963.48 L13257.425 963.48 L13388.479 963.48 L13494.332 963.48 L13494.332 2916.084 L13243.325 2916.084 L13243.325 1220.19 C13243.325 1007.768 13152.875 1002.979 13120.586 992.724 Z" class="lg1"/><path d="M14989.739 1340.928 L14989.739 1097.506 C14989.739 1097.506 14825.947 925.591 14457.733 925.591 C14089.52 925.591 13840.417 1135.072 13840.417 1418.954 C13840.417 1702.835 13944.686 1854.983 14355.87 2016.634 C14783.952 2184.929 14846.778 2298.805 14846.778 2485.451 C14846.778 2672.097 14719.23 2848.723 14413.551 2848.723 C14107.873 2848.723 13941.053 2674.451 13840.417 2522.269 L13819.109 2522.269 L13819.109 2764.668 C13819.109 2764.668 14065.824 2958.293 14413.551 2958.293 C14761.279 2958.293 15092.484 2783.886 15092.484 2422.209 C15092.484 2060.531 14894.511 1937.286 14551.951 1797.148 C14209.392 1657.01 14073.702 1577.227 14073.702 1367.836 C14073.702 1158.446 14234.219 1029.725 14457.733 1029.725 C14681.248 1029.725 14878.94 1171.657 14956.795 1340.928 Z" class="lg1"/></g></g></g></svg><span>Operations</span></h1><span class="who" id="who"></span><div class="thm" role="group" aria-label="Appearance"><button type="button" data-thm="light" title="Light" aria-label="Light"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button><button type="button" data-thm="auto" title="Match system" aria-label="Match system"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button><button type="button" data-thm="dark" title="Dark" aria-label="Dark"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg></button></div></header>
<!--DENIED-->
<nav class="side" id="side" aria-label="Sections">
<a href="#home" data-tab="home"><svg viewBox="0 0 24 24"><path d="M3.5 11.2 12 4.5l8.5 6.7"/><path d="M5.8 9.6V20h12.4V9.6"/><path d="M10 20v-5.5h4V20"/></svg><span>Home</span></a>
<a href="#tasks" data-tab="tasks"><svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M7.8 9.2l1.5 1.5 2.7-2.7M7.8 15.2l1.5 1.5 2.7-2.7M14.6 9.6h2.6M14.6 15.6h2.6"/></svg><span>Tasks</span><span class="lv-n" id="tkCount" hidden></span></a>
<div class="sg" data-sg="ops">Operations</div>
<a href="#fw" data-tab="fw"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 18 6"/></svg><span>Flight Watch</span><span class="lv-n" id="lvCount" hidden></span><span class="fw-n" id="fwN" hidden></span></a>
<a href="#bc" data-tab="bc"><svg viewBox="0 0 24 24"><rect x="3" y="6.5" width="12.5" height="11" rx="2"/><path d="M15.5 10.4 21 7.5v9l-5.5-2.9"/></svg><span>Broadcast</span></a>
<a href="#gates" data-tab="gates"><svg viewBox="0 0 24 24"><path d="M3.5 20.5h17"/><path d="M5.5 20.5V8.5l6.5-4 6.5 4v12"/><path d="M9.5 20.5v-6h5v6"/></svg><span>Gates</span></a>
<a href="#auto" data-tab="auto"><svg viewBox="0 0 24 24"><path d="M20.5 3.5 3.5 10.6l6.9 2.5 2.5 6.9z"/><path d="M10.4 13.1 20.5 3.5"/></svg><span>Automatic messages</span></a>
<a href="#reports" data-tab="reports"><svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M7 16.5v-5M12 16.5V7M17 16.5v-8"/></svg><span>Reports</span></a>
<a href="#navdata" data-tab="navdata"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6z"/><path d="M12 3.5v1.6M12 18.9v1.6M3.5 12h1.6M18.9 12h1.6"/></svg><span>Nav Data</span><span class="fw-n" id="ndN" hidden></span></a>
<div class="sg" data-sg="crew">Crew</div>
<a href="#pilots" data-tab="pilots"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.9 14.3c2.3.2 3.9 1.8 4.4 4.5"/></svg><span>Pilots</span></a>
<a href="#cal" data-tab="cal"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><span>Calendar</span></a>
<div class="sg" data-sg="comm">Communication</div>
<a href="#comms" data-tab="comms"><svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.8 7l8.2 6.2L20.2 7"/></svg><span>Messages</span><span class="lv-n" id="ibCount" hidden></span></a>
<a href="#docs" data-tab="docs"><svg viewBox="0 0 24 24"><path d="M6.5 3.5H14l4.5 4.5v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h7"/></svg><span>Documents</span><span class="lv-n q" id="dcN" hidden></span></a>
<a class="sx" href="#settings" data-tab="settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg><span>Settings</span></a>
</nav>
<main id="home" hidden>
<section class="hm-bar">
 <div class="hm-clock"><b id="hmClock">--:--:--Z</b><span id="hmDate"></span></div>
 <div class="hm-k" id="hmK"></div>
</section>
<section class="hm-tk" id="hmTk"><div class="lh"><h2 id="hmTkH">Tasks</h2><a class="lk" href="#tasks">Tasks ›</a></div><div id="hmTkB"><span class="empty">Loading…</span></div></section>
<section class="hm-act"><div class="lh"><h2>Action needed</h2><span class="hint" id="hmAt"></span></div><div id="hmAct"><span class="empty">Loading…</span></div></section>
<div class="hm-col">
<section id="hmFlS"><div class="lh"><h2>Flights now</h2><a class="lk" href="#fw">Flight Watch ›</a></div><div id="hmFl"><span class="empty">Loading…</span></div></section>
<section id="hmUpS"><div class="lh"><h2>Coming up</h2><a class="lk" href="#cal">Calendar ›</a></div><div id="hmUp"><span class="empty">Loading…</span></div></section>
</div>
</main>
<main id="tasks" hidden>
<section class="tk-top">
 <div class="tk-h"><div><h2>Tasks</h2><p class="hint" id="tkSub" style="margin:0"></p><div class="tk-mail" id="tkMail"></div></div>
 <div class="tk-tools"><select id="tkDept" aria-label="Department" hidden></select><div class="ib-seg" role="group" aria-label="Whose tasks"><button type="button" data-tkmine="0" aria-pressed="true">Everyone</button><button type="button" data-tkmine="1" aria-pressed="false">Mine</button></div><button class="primary" type="button" data-tknew>New task</button></div></div>
 <div id="tkMsg"></div>
 <div class="tk-form" id="tkForm" hidden></div>
</section>
<div class="tk-body" id="tkBody"><div class="tk-board" id="tkBoard"><span class="empty">Loading…</span></div><section class="tk-det" id="tkDet" hidden></section></div>
</main>
<main id="comms" hidden>
<section class="cm-side">
 <div class="cm-h"><h2>Messages</h2><details class="help"><summary aria-label="About messages">?</summary><div><p><b>Notice</b> is Polaris Mail: a subject, formatting and attachments, now or at a set time. Pilots read it in the EFB’s Mail and can answer; answers arrive in the Inbox.</p><p><b>AOC</b> is a short message on the flight deck’s AOC display, beside Hoppie ACARS. Pilots cannot answer it. It stays in the EFB under Flight › Messages for 30 days.</p><p>Messages between pilots are private and never appear here.</p></div></details></div>
 <div class="cm-new"><button type="button" class="primary" data-cmnew="mail"><svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.8 7l8.2 6.2L20.2 7"/></svg>New notice</button><button type="button" data-cmnew="aoc"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/></svg>New AOC</button></div>
 <button type="button" class="cm-set" data-cmset>From names and AOC templates</button>
 <div class="cm-seg" role="group" aria-label="Show"><button type="button" data-cmv="inbox" aria-pressed="true">Inbox<span class="lv-n" id="cmIbN" hidden></span></button><button type="button" data-cmv="sent" aria-pressed="false">Sent</button><button type="button" data-cmv="later" aria-pressed="false">Scheduled<span class="lv-n q" id="cmLaterN" hidden></span></button></div>
 <div class="cm-f" id="cmFi"><div class="ib-seg" role="group" aria-label="Conversations"><button type="button" data-ibs="open" aria-pressed="true">Open</button><button type="button" data-ibs="done" aria-pressed="false">Done</button></div><select id="ibDept" aria-label="Department"><option value="">All departments</option></select></div>
 <div class="cm-f" id="cmFs" hidden><div class="kf" role="group" aria-label="Kind"><button type="button" data-kf="all" aria-pressed="true">All</button><button type="button" data-kf="mail" aria-pressed="false">Notices</button><button type="button" data-kf="aoc" aria-pressed="false">AOC</button></div></div>
 <div class="ib-list" id="ibList"><p class="empty" style="padding:16px 18px">Loading…</p></div>
 <div class="cm-list" id="list" hidden><p class="empty" style="padding:16px 18px">Loading…</p></div>
</section>
<section class="cm-main">
 <div class="cm-empty" id="cmEmpty"><svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.8 7l8.2 6.2L20.2 7"/></svg><b>Nothing open</b><span>Pick a conversation or a sent message on the left, or write a new notice or AOC message.</span></div>
 <div id="ibView" hidden></div>
 <div id="cmItem" hidden></div>
 <div id="cmSet" hidden>
 <div class="cm-ch"><div class="pg-h" style="margin:0"><h2>From names and templates</h2><details class="help"><summary aria-label="About the composer">?</summary><div><p>From names are who a notice comes from. The first is the default.</p><p>AOC templates fill in the title and the message. <b>{CS}</b>, <b>{DEP}</b> and <b>{ARR}</b> become the flight’s callsign and airports; <b>___</b> marks what still has to be written, and a message is not sent while one is left.</p></div></details></div><button type="button" class="cm-x" data-cmclose aria-label="Close">✕</button></div>
 <label for="setFroms">From names <span class="hint" style="margin:0">one per line</span></label>
 <textarea id="setFroms" class="set-froms" spellcheck="false"></textarea>
 <label>AOC templates</label>
 <div class="set-tpl" id="setTpl"><span class="empty">Loading…</span></div>
 <div class="actions"><button type="button" id="setTplAdd">Add template</button><button type="button" class="primary" id="setSave">Save</button></div>
 <div id="setMsg"></div>
 </div>
 <div id="cmCompose" hidden>
 <div class="cm-ch"><h2 id="formTitle">New notice</h2><button type="button" class="cm-x" data-cmclose aria-label="Close">✕</button></div>
 <div class="kind" id="kind" hidden><label class="kd"><input type="radio" name="kind" value="mail" checked><span><b>Notice</b></span></label><label class="kd"><input type="radio" name="kind" value="aoc"><span><b>AOC</b></span></label></div>
 <label for="to">To</label>
 <div class="radio" id="to"><label id="toAllL"><input type="radio" name="to" value="all" checked> All pilots</label><label><input type="radio" name="to" value="one"> One pilot</label><label id="toCrewL"><input type="radio" name="to" value="crew"> A flight’s crew</label></div>
 <div id="toOne" class="to-one" hidden><div class="row"><div><label for="toPilot">Pilot ID</label><input type="text" id="toPilot" maxlength="12" placeholder="PAW0006" autocomplete="off" spellcheck="false"></div><div><label for="toCid">VATSIM CID</label><input type="text" id="toCid" maxlength="9" inputmode="numeric" placeholder="1234567" autocomplete="off"></div></div><input type="hidden" id="toName"><input type="hidden" id="toCs">
 <p class="hint" id="toHint">Only the pilot signed in to the EFB with this pilot ID, or whose vAMSYS account has this VATSIM CID.</p></div>
 <div id="toCrew" class="to-one" hidden><div class="row"><div><label for="crCs">Callsign</label><input type="text" id="crCs" maxlength="8" placeholder="PAW123" autocomplete="off" spellcheck="false"></div>
 <div><label for="crAdd">Add a pilot</label><div class="cr-add"><input type="text" id="crAdd" list="crPilots" maxlength="12" placeholder="Pilot ID or VATSIM CID" autocomplete="off" spellcheck="false"><button type="button" id="crAddB">Add</button></div><datalist id="crPilots"></datalist></div></div>
 <div class="cr-list" id="crList"></div>
 <p class="hint">Every pilot listed (both seats of a two-pilot crew), and any EFB flying this callsign for the next 18 hours.</p></div>
 <div id="mkMail">
 <div class="row"><div><label for="from">From</label><input type="text" id="from" list="froms" maxlength="60" value="Crew Management"><datalist id="froms"><option>Crew Management</option><option>Flight Operations</option><option>Training</option><option>Polaris News</option><option>Fleet</option></datalist></div>
 <div><label for="when">Send</label><select id="when"><option value="now">Now</option><option value="later">At a set time</option></select></div></div>
 <div id="atRow" hidden><label for="at">Send at (UTC)</label><input type="datetime-local" id="at"></div>
 <label for="subject">Subject</label><input type="text" id="subject" maxlength="160">
 <label for="body">Message</label><textarea id="body" maxlength="20000" placeholder="Dear Polaris pilots,&#10;&#10;**Bold**, *italic*, a line starting with - for a list, ## for a heading, links as [text](https://…)."></textarea>
 <label>Preview</label><div class="preview" id="preview"><span class="empty">The message as pilots will see it.</span></div>
 <label for="file">Attachments <span class="hint" style="margin:0">PDF, PNG, JPG, WebP or text · up to 5 files, 5 MB each</span></label>
 <input type="file" id="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"><ul class="atts" id="atts"></ul>
 </div>
 <div id="mkAoc" hidden>
 <div class="row"><div><label for="acTpl">Template</label><select id="acTpl"></select></div><div><label for="acTitle">Title</label><input type="text" id="acTitle" list="acTitles" maxlength="40" value="CREW MESSAGE" autocomplete="off"><datalist id="acTitles"></datalist></div></div>
 <label for="acBody">Message</label><textarea id="acBody" maxlength="2000" placeholder="WELCOME ABOARD. EXPECT RWY 05 FOR DEP. FUEL CHECK AT TOC." spellcheck="false"></textarea>
 <label>Preview</label><div class="ac-box"><div class="h">AOC MSG DISPLAY</div><div class="b" id="acPre"><i>CREW MESSAGE</i></div></div>
 <label class="ac-chk"><input type="checkbox" id="acPush" checked> Also send a notification to the pilots’ devices</label>
 </div>
 <div class="actions"><button type="button" class="primary" id="send">Send to all pilots</button><button type="button" id="cancel" hidden>Cancel editing</button></div>
 <div id="msg"></div>
 <p class="hint" id="kindHint"></p>
 </div>
</section>
</main>
<main id="ot" hidden>
<section>
 <div class="ot-bar"><h2>On-time performance</h2><details class="help"><summary aria-label="How on-time is counted">?</summary><div><p>The Worker looks at every Polaris flight on the vAMSYS flight map and VATSIM every 2 minutes, so each time is within about two minutes. <b>OUT</b>: first moves off the gate. <b>OFF</b>: airborne. <b>ON</b>: landed. <b>IN</b>: stopped at the gate for 3 minutes (or vAMSYS says it arrived). The schedule (STD, STA) is the vAMSYS booking. A departure is on time when OUT is within 15 minutes of STD (D15), an arrival when IN is within 15 minutes of STA (A15). Flights are kept 90 days.</p></div></details><div class="kf" role="group" aria-label="Period"><button type="button" data-otp="1" aria-pressed="true">Today</button><button type="button" data-otp="7" aria-pressed="false">7 days</button><button type="button" data-otp="30" aria-pressed="false">30 days</button><button type="button" data-otp="90" aria-pressed="false">90 days</button></div><button type="button" id="otNeed" aria-pressed="false" title="Late flights with no delay reason">Late, no reason</button><button type="button" id="otCsv">Download CSV</button><button type="button" id="otReload">Refresh</button></div>
 <div class="ot-kpi" id="otKpi"></div>
 <div class="ot-why" id="otWhy"></div>
 <div id="otErr"></div>
</section>
<section><div class="lh"><h2>Finished flights</h2><input type="search" id="otFind" placeholder="Callsign, pilot or airport" autocomplete="off" spellcheck="false"></div><div id="otLog"><span class="empty">Loading…</span></div>
 </section>
</main>
<main id="cal" hidden>
<section class="ca-main">
 <div class="ca-bar"><button type="button" data-ca="prev" aria-label="Previous month">‹</button><h2 id="caTitle">Calendar</h2><button type="button" data-ca="next" aria-label="Next month">›</button><button type="button" data-ca="today">Today</button><span class="ca-tz">Times are UTC</span><button type="button" class="primary" data-ca="new">New entry</button></div>
 <div class="ca-legend" id="caLegend"></div>
 <div class="ca-wd"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
 <div class="ca-grid" id="caGrid"></div>
 <div id="caErr"></div>
</section>
<section class="ca-side" id="caSide"><span class="empty">Loading…</span></section>
</main>
<main id="stands" hidden>
<div class="pg-top"><div><h1>Gates</h1><p>Which gate an arriving or departing flight is given.</p></div><div class="pg-st" id="stState"></div></div>
<section class="gt-apts"><input type="text" id="stFind" aria-label="Find or add an airport" placeholder="Find or add an airport" autocomplete="off" spellcheck="false"><div class="gt-al" id="stApts"></div><p class="hint">Airports with no rules get no gate.</p></section>
<section class="gt-main" id="stMain"><p class="empty">Loading…</p></section>
<section class="gt-log"><div class="lh"><h2>Sent in the last two days</h2><div class="st-lb"><div class="kf" role="group" aria-label="Show"><button type="button" data-stv="apt" aria-pressed="true">This airport</button><button type="button" data-stv="all" aria-pressed="false">All airports</button></div><button type="button" id="stReload">Refresh</button></div></div><p class="hint" style="margin:6px 0 10px">By the time the gate is used. <b>Change</b> sends the crew a GATE CHANGE.</p><div id="stLog"><span class="empty">Loading…</span></div></section>
</main>
<main id="auto" hidden>
<div class="pg-top"><div><h1>Automatic messages</h1><p>AOC messages the server sends crews by itself.</p></div><details class="help"><summary aria-label="About automatic messages">?</summary><div><p>Each is an AOC message to the flight’s crew in the EFB, with a push notification. Off: it is not sent. A switch takes effect at once.</p><p>The arrival and departure gates come from the rules on the Gates page. <b>Edit</b> opens the timing and the wording: write the text as the crew should read it, with <b>{FIELDS}</b> where the flight’s own values go. A line whose fields are all empty is left out.</p></div></details></div>
<section class="au-l" id="auList"><p class="empty" style="padding:16px 20px">Loading…</p></section>
<div id="auMsg"></div>
<p class="hint au-foot">Messages staff write by hand, the From names and the AOC templates are in <a class="lk" href="#templates">Messages</a>.</p>
</main>
<main id="settings" hidden>
<div class="pg-top"><div><h1>Settings</h1><p>Who can sign in, and what each role sees.</p></div><div class="pg-st" id="rlMail"></div></div>
<section id="rlCard">
 <div class="set-h"><div class="pg-h"><h2>People</h2><details class="help"><summary aria-label="About people">?</summary><div><p>Everyone who signs in gets a role, which decides the pages they see and what they may change; the server checks every change. Who can reach this admin at all is still set in Cloudflare Access.</p><p><b>Pilot ID</b> links someone to their EFB: signed in there as that pilot, the EFB’s Calendar shows the open tasks with a due time that are theirs or their department’s.</p><p>Task and AIRAC emails go to these addresses. On the free Workers plan each must first be verified in Cloudflare › Email Routing › Destination addresses.</p><p><b>Last signed in</b> is kept from 24 Nov 2026.</p></div></details></div><span class="lbl" id="rlCount"></span></div>
 <p class="rl-note" id="rlNote"></p>
 <div id="rlList"><span class="empty">Loading…</span></div>
 <div class="rl-add"><input type="email" id="rlEmail" placeholder="Email they sign in with" autocomplete="off" spellcheck="false" aria-label="Email"><select id="rlRole" aria-label="Role"></select><input type="text" id="rlPilot" class="rl-pid" placeholder="Pilot ID (optional)" maxlength="10" autocomplete="off" spellcheck="false" aria-label="Pilot ID, optional"><button class="primary" id="rlAdd" type="button">Add</button></div>
 <div id="rlMsg"></div>
</section>
<section id="rlRoleCard">
 <div class="set-h"><div class="pg-h"><h2>Roles</h2><details class="help"><summary aria-label="About roles">?</summary><div><p><b>Administrator</b> is built in: everything, these settings, and staff diagnostics. Make other roles and choose their pages and what they may change.</p><p>Every role has Home and Tasks. Pages use each other’s data (Home, the composer’s From names), so a role reads what its pages show.</p></div></details></div><button type="button" id="rlNew">New role</button></div>
 <div id="rlRoles"></div>
 <div class="rl-ed" id="rlEd" hidden></div>
 <div id="rlRMsg"></div>
</section>
<section class="set-moved"><div><h2>Moved</h2><p>The automatic AOC messages have their own page; the From names and AOC templates are in Messages.</p></div><div><a class="lk" href="#auto">Automatic messages ›</a><a class="lk" href="#templates">From names and templates ›</a></div></section>
</main>
<main id="bc" hidden>
<section class="bc-top">
 <div class="pg-h"><h2>Broadcast</h2><details class="help"><summary aria-label="About the broadcast desk">?</summary><div><p>The live broadcast desk: what OBS shows on the streaming pilot’s simulator PC, with its scenes switched from here. OBS sends the stream to YouTube itself; none of it goes through Polaris.</p><p>On that PC: OBS Studio with its WebSocket Server on (OBS › Tools › WebSocket Server Settings), and Polaris Navdata 1.7 or later set up for it on the EFB there (Ground › Simulator PC › Broadcast). Put the pilot’s flight on the desk under Setup: their PC joins within about half a minute.</p><p>Pick a scene to see it in Preview; TAKE (or Space) puts it on air, and what was on air comes back to Preview. Keys 1–9 pick the scenes in order. The auto director switches by the flight’s phase by itself (a phase with several scenes takes them in turn, every few minutes); TAKE turns it off.</p><p>The overlays are a Browser source in OBS showing the link under Setup; they show only while the flight is on the desk. A new link stops the old one.</p><p>Starting and ending the stream from here works only if it is allowed on the EFB on the simulator PC. If the PC drops off the desk, OBS keeps streaming what is on air.</p><p>The pictures here are small and come only while this page is open; they cost the stream nothing.</p><p><b>Polaris Cam</b> shows the cockpit cameras of that PC. With the Streaming pilot set and Polaris Cam there signing in by itself with Polaris Navdata, they show here automatically (<b>Auto</b>), as they do in Flight Watch. The Polaris Cam connection link under Setup stays the fallback for a PC without Navdata: while a PC is connected with it, its cameras show instead (<b>Direct link</b>).</p></div></details>
 <div class="bc-st" id="bcSt"></div>
 <button type="button" id="bcSetB" aria-expanded="false" aria-controls="bcSet">Setup</button></div>
 <div id="bcMsg"></div>
 <div class="bc-set" id="bcSet" hidden>
  <label class="au-sw"><input type="checkbox" id="bcOnC" class="bc-act"><span><b>Flight on the desk</b><small>The pilot’s simulator PC joins while it is on.</small></span></label>
  <div class="bc-g">
   <div><label for="bcPilot">Streaming pilot</label><input type="text" id="bcPilot" class="bc-act" placeholder="PAW0006" maxlength="10" autocomplete="off" spellcheck="false"></div>
   <div><label for="bcSlate">“Back soon” scene</label><select id="bcSlate" class="bc-act"></select></div>
   <div><label for="bcTitle">Overlay title</label><input type="text" id="bcTitle" class="bc-act" placeholder="First flight" maxlength="80"></div>
   <div><label for="bcSub">Line under it</label><input type="text" id="bcSub" class="bc-act" placeholder="From the pilot’s plan" maxlength="120"></div>
  </div>
  <div class="actions"><button type="button" class="primary bc-act" id="bcSave">Save</button></div>
  <div class="bc-url" id="bcUrlW" hidden><label for="bcUrl">The overlay, for OBS</label><div class="bc-urlr"><input type="text" id="bcUrl" readonly><button type="button" id="bcCopy">Copy</button><button type="button" class="bc-act" id="bcTok">New link</button><a id="bcDemo" target="_blank" rel="noopener">See it with sample numbers</a></div>
   <p class="hint">OBS › Sources › + › Browser: this link, 1920 × 1080, at the top of each camera scene.</p></div>
  <div class="bc-url" id="bcCamW" hidden><label for="bcCamUrl">Polaris Cam connection link</label><div class="bc-urlr"><input type="text" id="bcCamUrl" readonly><button type="button" id="bcCamCopy">Copy</button><button type="button" id="bcCamTok">New link</button></div>
   <p class="hint">Only for a Polaris Cam that does not sign in with Polaris Navdata (with Navdata, the streaming pilot’s cameras show by themselves): paste this link into Polaris Cam on the simulator PC. While a PC is connected with it, Broadcast shows that PC. A new link stops the old one.</p></div>
 </div>
</section>
<section class="bc-mon">
 <div class="bc-pgm" id="bcPgm"><div class="bc-cap"><b>Program</b><span id="bcPgmN">—</span><em id="bcAir" hidden>ON AIR</em></div><div class="bc-fr"><img id="bcPgmI" alt="" hidden><span class="bc-ph" id="bcPgmE">No picture</span></div></div>
 <div class="bc-pvw"><div class="bc-cap"><b>Preview</b><span id="bcPvwN">—</span></div><div class="bc-fr" id="bcPvwF"><img id="bcPvwI" alt="" hidden><span class="bc-ph" id="bcPvwE">Pick a scene below</span></div>
  <div class="bc-take"><button type="button" class="primary bc-act" id="bcTake" disabled>TAKE</button><button type="button" class="bc-act" id="bcBrb">Back soon</button></div>
  <p class="hint">Keys 1–9 pick a scene · Space takes it</p></div>
</section>
<section class="bc-cam" id="bcCam"><div class="lh"><h2>Polaris Cam</h2><div class="bc-st" id="bcCamSt"></div></div>
 <div class="bc-cg" id="bcCamG"><button type="button" class="bc-cc" data-camc="0"><div class="bc-cap"><b>Cam 1</b><span>—</span><em></em></div><div class="bc-fr"><canvas hidden></canvas><span class="bc-ph">No picture</span></div></button><button type="button" class="bc-cc" data-camc="1"><div class="bc-cap"><b>Cam 2</b><span>—</span><em></em></div><div class="bc-fr"><canvas hidden></canvas><span class="bc-ph">No picture</span></div></button><button type="button" class="bc-cc" data-camc="2"><div class="bc-cap"><b>Cam 3</b><span>—</span><em></em></div><div class="bc-fr"><canvas hidden></canvas><span class="bc-ph">No picture</span></div></button><button type="button" class="bc-cc" data-camc="3"><div class="bc-cap"><b>Cam 4</b><span>—</span><em></em></div><div class="bc-fr"><canvas hidden></canvas><span class="bc-ph">No picture</span></div></button></div>
 <p class="hint">The cockpit cameras from Polaris Cam on the simulator PC, only while this page is open: the streaming pilot’s own when their Polaris Cam signs in with Polaris Navdata (Auto), or the PC connected with the link under Setup (Direct link), which comes first and overrides Auto. Click a camera to see it large; click it again (or Esc) for all four.</p></section>
<section class="bc-wall"><div class="lh"><h2>Cameras and scenes</h2><button type="button" class="bc-act bc-sm" id="bcRef">Ask OBS again</button></div><div class="bc-tiles" id="bcTiles"></div></section>
<div class="bc-cols">
 <section class="bc-ovs"><h2>Overlays on the picture</h2><div id="bcOv"></div></section>
 <section class="bc-auto"><div class="lh"><h2>Auto director</h2><label class="au-sw"><input type="checkbox" id="bcAuto" class="bc-act" aria-label="Auto director"></label></div><p class="hint" id="bcAutoH"></p><div id="bcRules"></div>
  <label for="bcEvery">Change every</label><select id="bcEvery" class="bc-act"><option value="60">minute</option><option value="120">2 minutes</option><option value="180">3 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option></select></section>
 <section class="bc-fl"><h2>The flight</h2><div id="bcFl"></div></section>
</div>
<div class="bc-cols">
 <section class="bc-hl"><h2>Stream health</h2><div id="bcHl"></div></section>
 <section class="bc-em"><h2>If something goes wrong</h2><div id="bcEm"></div></section>
 <section class="bc-lg"><h2>Log</h2><div id="bcLog"></div></section>
</div>
</main>
<main id="navdata" hidden>
<section class="nd-top">
 <div class="pg-h"><h2>Nav Data</h2><details class="help"><summary aria-label="About Nav Data">?</summary><div><p>Where the EFB’s navigation data comes from, region by region, and whether each source is current. Most sources update themselves; China’s AIP data set is uploaded here each AIRAC, because the CAAC eAIP needs a sign-in.</p><p>The sources are checked about every 6 hours, a few at a time. Check asks one again now; Check all goes through them three at a time, with a bar to show how far it has got, and Stop ends it after the ones in hand. Nothing here changes the data itself.</p></div></details><span class="nd-sum" id="ndSum"></span><button type="button" id="ndAll">Check all</button></div>
 <div class="nd-prog" id="ndProg" hidden></div>
 <div class="nd-cyc" id="ndCyc"></div>
 <div class="nd-rm" id="ndRm" hidden></div>
</section>
<div class="nd-flt" id="ndFlt"><div class="nd-tabs" id="ndTabs" role="tablist" aria-label="Show"></div><input type="search" id="ndQ" placeholder="Find a country or source" aria-label="Find a country or source" autocomplete="off"></div>
<div id="ndList"><section><span class="empty">Loading…</span></section></div>
<input type="file" id="ndFile" class="nd-file" tabindex="-1" aria-hidden="true">
</main>
<main id="docs" hidden>
<section>
 <div class="pg-h"><h2 id="dcFormTitle">Add a document</h2><details class="help"><summary aria-label="About documents">?</summary><div><p>Signed-in pilots see these in the EFB under Flight › Documents › Polaris Airways, grouped by folder, and can keep them on their device to read offline. Titles sort by their numbers first, so “01 …”, “02 …” keep an order. A replaced file reaches everyone as a new version; the EFB swaps it in by itself.</p><p>With <b>Pilots confirm they have read it</b> on, the EFB asks each pilot to tap “I have read it” in the document, and the list here shows who has not, for the version now published. A new version asks everyone again.</p></div></details></div>
 <label for="dcFile" id="dcFileL">PDF file <span class="hint" style="margin:0">up to 100 MB</span></label>
 <input type="file" id="dcFile" accept="application/pdf,.pdf">
 <div class="dc-pre" id="dcPre" hidden><img id="dcCov" alt=""><div><b id="dcPName"></b><div class="hint" id="dcPMeta"></div></div></div>
 <label for="dcTitle">Title</label><input type="text" id="dcTitle" maxlength="120" placeholder="Flight Operations Manual" autocomplete="off">
 <div class="row"><div><label for="dcFolder">Folder</label><input type="text" id="dcFolder" list="dcFolders" maxlength="60" placeholder="Flight Operations" autocomplete="off"><datalist id="dcFolders"></datalist></div>
 <div><label for="dcRev">Revision</label><input type="text" id="dcRev" maxlength="40" placeholder="Rev 26-01" autocomplete="off"></div></div>
 <label class="ac-chk"><input type="checkbox" id="dcAck"> Pilots confirm they have read it</label>
 <div class="dc-prog" id="dcProg" hidden><span></span></div>
 <div class="actions"><button type="button" class="primary" id="dcSave">Upload</button><button type="button" id="dcCancel" hidden>Cancel editing</button></div>
 <div id="dcMsg"></div>
 
</section>
<section><h2>Documents</h2><p class="hint" id="dcUse" style="margin:-6px 0 6px"></p><div id="dcAckErr"></div><div id="dcList"><span class="empty">Loading…</span></div></section>
</main>
<main id="pilots" hidden>
<section class="pl"><div class="pl-h"><div><div class="pg-h" style="margin-bottom:4px"><h2>Pilots</h2><details class="help"><summary aria-label="About pilots">?</summary><div><p>Pilots sign in to the EFB with their vAMSYS account; there are no EFB passwords. <b>Sign out</b> ends a pilot's EFB sign-ins on every device; they can sign in again with vAMSYS. To remove a pilot for good, remove them in vAMSYS.</p><p>Pick a pilot to see their flight now, recent flights, messages and the documents they have confirmed.</p></div></details></div><p class="hint" id="plSum">Loading…</p></div><input type="search" id="plFind" placeholder="Search pilot ID, name or CID" autocomplete="off"></div>
 <div class="pl-wrap"><table class="pl-t"><thead><tr><th>Pilot</th><th>Rank</th><th>VATSIM CID</th><th>EFB</th><th>First sign-in</th><th>Last sign-in</th><th></th></tr></thead><tbody id="plList"></tbody></table></div>
 
 <div id="plMsg"></div></section>
<section class="pl-prof" id="plProf" hidden></section>
</main>
<main id="live" hidden>
<div class="lv-stage"><canvas id="lvGlobe" aria-label="Globe with Polaris flights"></canvas><div class="lv-src" id="lvSrc"></div><div class="lv-ctl"><button type="button" data-lv="in" aria-label="Zoom in">+</button><button type="button" data-lv="out" aria-label="Zoom out">−</button><button type="button" data-lv="all" aria-label="Whole globe" title="Whole globe"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg></button></div></div>
<aside class="lv-side"><div class="fw" id="fwBox" hidden></div><div class="fw fw-cam" id="fwCam" hidden></div><div class="fw fw-camg" id="fwCamGround" hidden></div><div class="lv-sum" id="lvSum"></div><div class="lv-list" id="lvList"></div><div class="lv-det" id="lvDet" hidden><div id="lvDetMain"></div><div class="fo" id="lvOps"></div></div></aside>
</main>
<!--PERM-->
<script>
const $=s=>document.querySelector(s),esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* the same light markup the EFB renders */
function md(t){const L=esc(t).split("\\n"),out=[];let ul=false,para=[];const inl=s=>s.replace(/\\*\\*(.+?)\\*\\*/g,"<b>$1</b>").replace(/(^|[^*])\\*(?!\\s)(.+?)\\*/g,"$1<i>$2</i>").replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
 const flush=()=>{if(para.length){out.push("<p>"+para.map(inl).join("<br>")+"</p>");para=[]}};
 for(const l of L){if(/^\\s*[-•]\\s+/.test(l)){flush();if(!ul){out.push("<ul>");ul=true}out.push("<li>"+inl(l.replace(/^\\s*[-•]\\s+/,""))+"</li>");continue}if(ul){out.push("</ul>");ul=false}
  if(/^##\\s+/.test(l)){flush();out.push("<h4>"+inl(l.replace(/^##\\s+/,""))+"</h4>")}else if(!l.trim())flush();else para.push(l)}
 flush();if(ul)out.push("</ul>");return out.join("")}
function thmUi(){let t="auto";try{t=localStorage.getItem("pmTheme")||"auto"}catch(e){}document.querySelectorAll("[data-thm]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.thm===t)))}
document.addEventListener("click",e=>{const b=e.target.closest("[data-thm]");if(!b)return;const t=b.dataset.thm;try{t==="auto"?localStorage.removeItem("pmTheme"):localStorage.setItem("pmTheme",t)}catch(x){}if(t==="auto")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;thmUi()});
thmUi();
let S={mails:[],edit:null,keep:[],add:[]};
/* a refusal throws an Error with its message, its status and what the server sent (a 409's plan, say). A request with
   no answer in 45 s (opt.timeout: longer ones) is stopped and throws too (status 0, timeout), so nothing is left
   waiting for it for ever (P2, Nov 2026) */
const api=async(path,opt)=>{const o={...(opt||{})},ms=+o.timeout||45000;delete o.timeout;
 const c=typeof AbortController==="function"?new AbortController():null,T=c?setTimeout(()=>c.abort(),ms):0;
 const late=()=>Object.assign(new Error("No answer from the server in "+Math.round(ms/1000)+" s. Check whether it went through before you try again."),{status:0,timeout:true});
 let r,j=null;
 try{r=await fetch(path,{credentials:"same-origin",...o,...(c?{signal:c.signal}:{})});try{j=await r.json()}catch(e){if(c&&c.signal.aborted)throw late()}}
 catch(e){if(c&&c.signal.aborted)throw late();throw e}finally{if(T)clearTimeout(T)}
 if(!r.ok)throw Object.assign(new Error((j&&j.error)||("HTTP "+r.status)),{status:r.status,data:j});return j};
const say=(t,ok)=>{$("#msg").innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
const fmt=ms=>new Date(ms).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})+" "+new Date(ms).toISOString().slice(11,16)+"Z";
const kb=n=>n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
/* ---------- pages: the sidebar's sections, one at a time (Nov 2026). Old addresses (#mail, #live, #ot, #inbox,
   #stands, #aoc) open the page that has their part now. ---------- */
const PG={home:"home",tasks:"tasks",fw:"live",bc:"bc",gates:"stands",auto:"auto",reports:"ot",navdata:"navdata",pilots:"pilots",cal:"cal",comms:"comms",docs:"docs",settings:"settings"};
const PG_T={home:"Home",tasks:"Tasks",fw:"Flight Watch",bc:"Broadcast",gates:"Gates",auto:"Automatic messages",reports:"Reports",navdata:"Nav Data",pilots:"Pilots",cal:"Calendar",comms:"Messages",docs:"Documents",settings:"Settings"};
const PG_OLD={live:"fw",stands:"gates",ot:"reports",mail:"comms",inbox:"comms",aoc:"comms",templates:"comms",sent:"comms"};
const PG_LOAD={},PG_TICK={};let pgNow="",pgTimer=0,pgAsk="";
const pgOf=()=>{const h=location.hash.slice(1);return PG[h]?h:PG_OLD[h]||"home"};
/* an old address: the new one in its place, without a new history entry */
function pgFix(){const h=location.hash.slice(1);if(!PG_OLD[h])return;pgAsk=h;history.replaceState(null,"","#"+PG_OLD[h])}
function route(){pgFix();if(document.querySelector(".deny"))return;let p=pgOf();
 if(p==="settings"&&!pgHas(p)&&pgHas("auto")){history.replaceState(null,"","#auto");p="auto"}
 if(!pgHas(p)){history.replaceState(null,"","#home");p="home"}
 for(const [k,id] of Object.entries(PG)){const m=document.getElementById(id);if(m)m.hidden=k!==p}
 document.querySelectorAll(".side [data-tab]").forEach(a=>a.setAttribute("aria-current",String(a.dataset.tab===p)));
 document.body.dataset.tab=p;document.title=PG_T[p]+" · Polaris Operations";
 const first=pgNow!==p;pgNow=p;
 if(pgAsk){const a=pgAsk;pgAsk="";cmAsk(a)}
 window.dispatchEvent(new Event("pm:tab"));
 clearInterval(pgTimer);const t=PG_TICK[p];if(t)pgTimer=setInterval(()=>{if(!document.hidden)t[0]()},t[1]);
 if(PG_LOAD[p])PG_LOAD[p](first);
 if(first)scrollTo({top:0})}
/* ---------- roles (Settings › Roles, Nov 2026): the pages the person signed in sees and what they may change. The
   server sends them with the page (window.PM_PERM) with the classes on <html> that hide the rest (no-p-*, no-a-*),
   and is asked again (/admin/api/me) when the page comes back into view, so a role changed meanwhile shows. Data is
   asked for only from a page the role sees (the server checks the same: READS in mail.js). ---------- */
let ROLE="admin",PERM=null,ME_AT=0,ROLES_ON=false;
const RL_PAGES=[["fw","Flight Watch"],["bc","Broadcast"],["gates","Gates"],["settings","Automatic messages"],["reports","Reports"],["navdata","Nav Data"],["pilots","Pilots"],["cal","Calendar"],["comms","Messages"],["docs","Documents"]];
const RL_ACTS=[["msg","Send messages","Notices, AOC messages and inbox replies, also from Flight Watch and Pilots","comms"],["gates","Change gates","The gate plan, and a flight’s gate (sends GATE CHANGE)","gates"],["delay","Delay reasons","On a flight in Flight Watch, and in Reports","reports"],["cal","Edit the calendar","Entries, and which vAMSYS events show","cal"],["docs","Upload and edit documents","New documents, their details, replacing a file","docs"],["docsdel","Delete documents","","docs"],["pilots","Sign pilots out","Ends a pilot’s EFB sign-ins on every device","pilots"],["navdata","Nav Data checks and uploads","Checking sources, uploading AIP Japan and China charts","navdata"],["live","Direct the live broadcast","Scenes, overlays and the auto director on Broadcast; starting and ending the stream","bc"],["settings","Change automatic messages","On or off, timing and wording; the From names and AOC templates in Messages","settings"],["tasks","Publish tasks","Make tasks for any department, change and delete them, and see what every department is doing",""]];
/* Automatic messages is the role page "settings" (its name before Nov 2026); Settings itself (People, Roles) is for administrators */
const pgHas=p=>!PERM||(p==="settings"?PERM.can.has("roles"):PERM.pages.has(p==="auto"?"settings":p));
function permSet(j){ROLE=j.role||"admin";ROLES_ON=!!j.roles;const R=document.documentElement;
 const pg=new Set(j.pages||["home","tasks"].concat(RL_PAGES.map(x=>x[0]))),can=new Set(j.can||RL_ACTS.map(x=>x[0]).concat(["roles"]));
 RL_PAGES.forEach(x=>R.classList.toggle("no-p-"+x[0],!pg.has(x[0])));RL_ACTS.map(x=>x[0]).concat(["roles"]).forEach(k=>R.classList.toggle("no-a-"+k,!can.has(k)));
 PERM={pages:pg,can};const w=$("#who");if(w&&j.email)w.textContent="Signed in as "+j.email+(j.roles?" · "+(j.roleName||j.role):"")}
function permApply(j){const was=PERM?[...PERM.pages].join():"";permSet(j);if(!PERM.pages.has(pgOf())||(was&&was!==[...PERM.pages].join()))route()}
function meLoad(){ME_AT=Date.now();return api("/admin/api/me").then(permApply).catch(e=>{if(/has no role/.test(e.message))location.reload()})}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-ME_AT>3e4)meLoad()});
if(window.PM_PERM){permSet(window.PM_PERM);ME_AT=Date.now()}
/* what several pages read (Home, Flight Watch): one request, kept a short while. Each is shown on these pages */
const OPS_PG={live:["fw","pilots"],ooo:["fw","reports","pilots"],stands:["gates","auto","fw"],aoc:["comms","fw"],set:["auto","comms","fw"],nav:["navdata"]};
const opsOk=k=>(OPS_PG[k]||[]).some(pgHas);
const OPS={},OPS_URL={live:"/admin/api/live",ooo:"/admin/api/ooo",stands:"/admin/api/stands",aoc:"/admin/api/aoc",set:"/admin/api/settings",nav:"/admin/api/navdata"};
/* each request is numbered (n, the one on its way: pn); opsDrop, after a write, notes the last one asked before it
   (dn). A forced refresh (age 0) never takes a request that set out before the write: it asks again. An answer is kept
   only while no later request's answer has been (an), so a slow old one never puts back what was there before (P2) */
function opsGet(k,age){if(!opsOk(k))return Promise.reject(new Error("Your role does not see this"));const o=OPS[k]||(OPS[k]={at:0,v:null,p:null,err:""});
 if(o.p&&(age!==0||(o.pn||0)>(o.dn||0)))return o.p;if(o.v&&Date.now()-o.at<(age==null?30000:age))return Promise.resolve(o.v);
 const n=o.n=(o.n||0)+1,p=api(OPS_URL[k]).then(v=>{if(n<(o.an||0))return o.v||v;o.an=n;o.v=v;o.at=n>(o.dn||0)?Date.now():0;o.err="";return v},e=>{if(n>=(o.an||0))o.err=e.message;if(o.v)return o.v;throw e}).finally(()=>{if(o.p===p)o.p=null});
 o.p=p;o.pn=n;return p}
const opsV=k=>OPS[k]&&OPS[k].v;
const opsDrop=k=>{const o=OPS[k];if(o){o.at=0;o.dn=o.n||0}};
/* ACCEPT (Nov 2026): an AOC message to a pilot or a crew stays on their EFB until they accept it. v is what
   /admin/api/aoc answers: rc[id] = [{u, d: on the pilot's EFB since, a: accepted at}], for messages since ackFrom. */
const akZ=t=>{const d=new Date(t);return String(d.getUTCHours()).padStart(2,"0")+String(d.getUTCMinutes()).padStart(2,"0")+"Z"};
function akOf(m,v){if(!v||!m||!m.to||!v.ackFrom||m.t<v.ackFrom)return null;if(!v.rc)return{na:true,L:[]};
 const L=(v.rc[m.id]||[]).map(x=>({u:x.u,d:x.d,a:x.a,r:x.r||0})),want=(m.to.crew?(m.to.m||[]).map(x=>x.pilot):[m.to.pilot]).filter(Boolean);
 want.forEach(u=>{if(!L.some(x=>x.u===u))L.push({u,d:0,a:0,r:0})});
 const acc=L.filter(x=>x.a).length,del=L.filter(x=>x.d).length,rej=L.filter(x=>x.r).length,open=!L.length||L.some(x=>!x.a&&!x.r),age=Date.now()-m.t;
 return{L,acc,del,rej,open,late:open&&age>10*6e4&&age<(v.ackHours||18)*36e5,old:open&&age>=(v.ackHours||18)*36e5}}
/* one line: where the message stands */
function akChip(m,v){const k=akOf(m,v);if(!k)return"";if(k.na)return'<span class="ak">Receipts not available</span>';
 if(k.rej){const x=k.L.find(y=>y.r);return '<span class="ak rej">Rejected'+(k.L.length===1?" "+akZ(x.r):" by "+k.rej+" of "+k.L.length)+"</span>"}
 const t=!k.open?"Accepted"+(k.L.length===1?" "+akZ(k.L[0].a):" by "+(k.acc===2?"both":"all "+k.acc)):k.acc?"Accepted by "+k.acc+" of "+k.L.length:k.del?"Delivered, not accepted":"Not on an EFB yet";
 return '<span class="ak'+(!k.open?" ok":k.late?" late":"")+'">'+t+"</span>"}
/* each pilot: delivered and accepted */
function akList(m,v){const k=akOf(m,v);if(!k)return"";if(k.na)return'<div class="ak-l"><div><span class="ak">Receipts are not available right now</span></div></div>';
 const c=k.late?" late":"";
 if(!k.L.length)return'<div class="ak-l"><div><span class="ak'+c+'">Not on an EFB yet</span><small>'+(k.old?"No crew EFB took it in 18 hours.":"It shows here once an EFB flying this callsign has it.")+"</small></div></div>";
 return '<div class="ak-l">'+k.L.map(x=>"<div><b>"+esc(x.u)+"</b>"+(x.r?'<span class="ak rej">Rejected '+akZ(x.r)+"</span><small>on the EFB since "+akZ(x.d)+"</small>":x.a?'<span class="ak ok">Accepted '+akZ(x.a)+"</span><small>on the EFB since "+akZ(x.d)+"</small>":x.d?'<span class="ak'+c+'">Delivered '+akZ(x.d)+", not accepted</span>":'<span class="ak'+c+'">Not on the EFB yet</span>')+"</div>").join("")+"</div>"}
/* the From names and AOC templates (Settings), with defaults until they come */
let SETV={froms:["Crew Management","Flight Operations","Training","Polaris News","Fleet"],tpl:[{title:"CREW MESSAGE",body:""}]};
function setApply(s){if(!s||!Array.isArray(s.froms))return;SETV=s;
 const f=$("#froms");if(f)f.innerHTML=s.froms.map(x=>"<option>"+esc(x)+"</option>").join("");
 const t=$("#acTpl");if(t)t.innerHTML='<option value="">Fill in from a template…</option>'+s.tpl.map((x,i)=>'<option value="'+i+'">'+esc(x.title)+"</option>").join("");
 const tt=$("#acTitles");if(tt)tt.innerHTML=s.tpl.map(x=>"<option>"+esc(x.title)+"</option>").join("");
 if(!S.edit&&$("#from")&&!$("#subject").value&&!$("#body").value)$("#from").value=s.froms[0];
 foTplUi()}
/* a template's {CS}, {DEP} and {ARR} from the flight; what is not known stays ___ to be written */
const tplFill=(b,f)=>String(b||"").replace(/\\{CS\\}/g,(f&&f.cs)||"___").replace(/\\{DEP\\}/g,(f&&f.dep)||"___").replace(/\\{ARR\\}/g,(f&&f.arr)||"___");
/* put the caret on the first ___ */
function tplCaret(ta){if(!ta)return;const i=ta.value.indexOf("___");ta.focus();if(i>=0)ta.setSelectionRange(i,i+3);else ta.setSelectionRange(ta.value.length,ta.value.length)}
function attsUi(){const old=S.edit?(S.mails.find(m=>m.id===S.edit)||{}).att||[]:[];
 $("#atts").innerHTML=old.filter(a=>S.keep.includes(a.n)).map(a=>'<li>📎 '+esc(a.name)+' <span class="hint" style="margin:0">'+kb(a.size)+'</span><button data-rmk="'+a.n+'">Remove</button></li>').join("")+S.add.map((f,i)=>'<li>📎 '+esc(f.name)+' <span class="hint" style="margin:0">'+kb(f.size)+' · new</span><button data-rma="'+i+'">Remove</button></li>').join("")}
/* recipient: all pilots, or one pilot by callsign and/or VATSIM CID */
const toMode=()=>(document.querySelector("input[name=to]:checked")||{}).value||"all";
function toGet(){const md=toMode();if(md==="crew")return {crew:true,cs:$("#crCs").value.toUpperCase().replace(/[^A-Z0-9]/g,""),m:S.crew.slice()};if(md!=="one")return null;return {pilot:$("#toPilot").value.toUpperCase().replace(/[^A-Z0-9]/g,""),cid:$("#toCid").value.replace(/[^0-9]/g,""),cs:$("#toCs").value,name:$("#toName").value}}
const toWho=t=>t.crew?(t.cs||"flight")+" crew":t.pilot||(t.cid?"CID "+t.cid:"")||t.cs||"";
const toTip=t=>t.crew?(t.m||[]).map(x=>(x.pilot||"CID "+x.cid)+(x.name?" "+x.name:"")).join(", ")||"Only EFBs flying this callsign":[t.name,t.cs].filter(Boolean).join(" · ");
const toLabel=t=>t&&t.crew?"the "+(t.cs||"")+" crew"+(t.m&&t.m.length?" ("+t.m.map(x=>x.pilot||"CID "+x.cid).join(", ")+")":""):t?[t.pilot,t.cid?"CID "+t.cid:"",!t.pilot&&!t.cid?t.cs:""].filter(Boolean).join(" · "):"all pilots";
function toUi(){const md=toMode();$("#toOne").hidden=md!=="one";$("#toCrew").hidden=md!=="crew";if(md==="crew"){crUi();crPilots()}kindUi();preview()}
function toSet(t){if(t&&t.crew){document.querySelector("input[name=to][value=crew]").checked=true;$("#crCs").value=t.cs||"";S.crew=(t.m||[]).slice();toUi();return}document.querySelector("input[name=to][value="+(t?"one":"all")+"]").checked=true;$("#toPilot").value=(t&&t.pilot)||"";$("#toCid").value=(t&&t.cid)||"";$("#toCs").value=(t&&t.cs)||"";$("#toName").value=(t&&t.name)||"";toUi()}
/* ---------- Messages: send as Mail or as AOC (the flight deck's AOC display; no reply) ---------- */
S.aoc=[];S.kf="all";
const kind=()=>(document.querySelector("input[name=kind]:checked")||{}).value==="aoc"?"aoc":"mail";
function kindSet(k){const r=document.querySelector("input[name=kind][value="+(k==="aoc"?"aoc":"mail")+"]");if(r&&!r.disabled)r.checked=true;kindUi()}
function acPreview(){const z=new Date(),hm=String(z.getUTCHours()).padStart(2,"0")+String(z.getUTCMinutes()).padStart(2,"0")+"Z";
 $("#acPre").innerHTML="<i>"+esc(($("#acTitle").value.trim()||"CREW MESSAGE").toUpperCase()+" "+hm)+"</i>"+esc($("#acBody").value.toUpperCase())}
/* AOC to a flight's crew: its callsign and the pilots in it (one, or both seats) */
S.crew=[];const PLN={};let plnP=null;
function crUi(){$("#crList").innerHTML=S.crew.length?S.crew.map((x,i)=>'<span class="cr-p"><b>'+esc(x.pilot||"CID "+x.cid)+"</b>"+(x.name?"<small>"+esc(x.name)+"</small>":"")+'<button type="button" data-crrm="'+i+'" aria-label="Remove '+esc(x.pilot||x.cid)+'">×</button></span>').join(""):'<span class="hint">No pilots added yet: only EFBs flying this callsign get it.</span>'}
function crPilots(){if(plnP||!["pilots","comms","docs","cal"].some(pgHas))return;plnP=api("/admin/api/pilots").then(j=>{const L=(j&&j.pilots)||[];L.forEach(p=>{PLN[p.u]=p.name||""});$("#crPilots").innerHTML=L.map(p=>'<option value="'+esc(p.u)+'">'+esc(p.name||"")+"</option>").join("")}).catch(()=>{plnP=null})}
function crAdd(){const v=$("#crAdd").value.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");if(!v)return;const cid=/^[0-9]{4,9}$/.test(v),x=cid?{pilot:"",cid:v,name:""}:{pilot:v,cid:"",name:PLN[v]||""};
 $("#crAdd").value="";if(S.crew.some(y=>(x.pilot&&y.pilot===x.pilot)||(x.cid&&y.cid===x.cid)))return;if(S.crew.length>=4){say("At most 4 pilots in a crew.");return}S.crew.push(x);crUi();toUi()}
function kindUi(){const a=kind()==="aoc";$("#mkMail").hidden=a;$("#mkAoc").hidden=!a;
 document.querySelector("input[name=kind][value=aoc]").disabled=!!S.edit;
 $("#kindHint").textContent=a?"Shows in the EFB under Flight › Messages for 30 days. Pilots cannot answer an AOC message.":"Pilots read notices in the EFB’s Mail and can answer; answers arrive in the Inbox.";
 if(!S.edit){$("#formTitle").textContent=a?"New AOC message":"New notice";const t=toGet();$("#send").textContent=(a?"Send AOC to ":"Send to ")+(t?(t.crew||t.pilot||t.cid?toWho(t):"this pilot"):"all pilots")}acPreview()}
/* the Live tab's "Message" and "AOC" buttons, and the Pilots tab's "Message" */
/* true when the composer is opened for it; false when staff keep the message they are writing (asked, as New does) */
window.pmCompose=function(t,k){if(cmDirty()&&!confirm("Discard the message you are writing?"))return false;
 reset();$("#acTitle").value="CREW MESSAGE";$("#acBody").value="";kindSet(k);
 /* from a Live flight, Mail or AOC goes to its crew: the callsign, and this pilot to start with */
 if(t&&!t.crew&&t.cs)t={crew:true,cs:t.cs,m:t.pilot||t.cid?[{pilot:t.pilot||"",cid:String(t.cid||""),name:t.name&&t.name!==t.pilot?t.name:""}]:[]};toSet(t);if($("#from").value===SETV.froms[0]&&SETV.froms.includes("Flight Operations"))$("#from").value="Flight Operations";say("");CM.item="";CM.pane="compose";cmUi();location.hash="#comms";setTimeout(()=>{(k==="aoc"?$("#acBody"):$("#subject")).focus()},60);return true};
function preview(){const b=$("#body").value,t=toGet();$("#preview").innerHTML=b.trim()?"<h4 style='margin-top:0'>"+esc($("#subject").value||"(no subject)")+"</h4><div class='hint' style='margin:-2px 0 10px'>From "+esc($("#from").value||"…")+" · "+(t?"To "+esc(toLabel(t))+(t.name?" ("+esc(t.name)+")":""):"To all Polaris pilots")+"</div>"+md(b):'<span class="empty">The message as pilots will see it.</span>'}
S.loading=0;
async function load(){if(!pgHas("comms"))return;S.loading++;let a,b;
 try{[a,b]=await Promise.allSettled([api("/admin/api/mail"),api("/admin/api/aoc")])}finally{S.loading--}
 if(a.status==="fulfilled")S.mails=a.value.mails||[];if(b.status==="fulfilled"){S.aoc=b.value.msgs||[];S.aocV=b.value}
 S.listErr=[a,b].filter(x=>x.status==="rejected").map(x=>x.reason.message).join(" · ");listUi()}
function reset(){S.edit=null;S.keep=[];S.add=[];S.crew=[];$("#crCs").value="";$("#formTitle").textContent="New notice";$("#send").textContent="Send to all pilots";$("#cancel").hidden=true;["subject","body"].forEach(i=>$("#"+i).value="");$("#from").value=SETV.froms[0]||"Crew Management";$("#when").value="now";$("#atRow").hidden=true;$("#file").value="";attsUi();toSet(null)}
const localInput=ms=>new Date(ms).toISOString().slice(0,16);
document.addEventListener("click",async e=>{const t=e.target.closest("button");if(!t)return;
 if(t.dataset.rmk!=null){S.keep=S.keep.filter(n=>n!==+t.dataset.rmk);attsUi()}
 else if(t.dataset.rma!=null){S.add.splice(+t.dataset.rma,1);attsUi()}
 else if(t.dataset.edit){const m=S.mails.find(x=>x.id===t.dataset.edit);if(!m)return;S.edit=m.id;document.querySelector("input[name=kind][value=mail]").checked=true;S.keep=m.att.map(a=>a.n);S.add=[];toSet(m.to||null);$("#from").value=m.from;$("#subject").value=m.subject;$("#body").value=m.body;
  const q=m.sendAt>Date.now();$("#when").value=q?"later":"now";$("#atRow").hidden=!q;if(q)$("#at").value=localInput(m.sendAt);$("#formTitle").textContent="Edit notice";$("#send").textContent=q?"Save changes":"Save changes (already sent)";$("#cancel").hidden=false;attsUi();preview();say("");scrollTo({top:0,behavior:"smooth"})}
 else if(t.dataset.del){const m=S.mails.find(x=>x.id===t.dataset.del);if(!m||!confirm('Delete "'+m.subject+'"? Pilots will no longer see it.'))return;try{await api("/admin/api/mail?id="+encodeURIComponent(m.id),{method:"DELETE"});if(S.edit===m.id)reset();say("Deleted.",true);load()}catch(er){say(er.message)}}
 else if(t.dataset.acdel){const m=S.aoc.find(x=>x.id===t.dataset.acdel);if(!m||!confirm('Delete the AOC message "'+m.title+'"? It goes off every EFB.'))return;try{await api("/admin/api/aoc?id="+encodeURIComponent(m.id),{method:"DELETE"});say("Deleted.",true);load()}catch(er){say(er.message)}}
 else if(t.dataset.kf){S.kf=t.dataset.kf;document.querySelectorAll("[data-kf]").forEach(b=>b.setAttribute("aria-pressed",String(b===t)));listUi()}
 else if(t.id==="cancel"){reset();say("")}
 else if(t.dataset.crrm!=null){S.crew.splice(+t.dataset.crrm,1);crUi();toUi()}
 else if(t.id==="crAddB")crAdd();
 else if(t.id==="send"&&kind()==="aoc"){const to=toGet();if(to&&to.crew){if(!to.cs){say("Add the flight's callsign (for example PAW123).");return}}else if(to&&!to.pilot&&!to.cid){say("Add the pilot's ID (for example PAW0006) or VATSIM CID.");return}const body=$("#acBody").value.trim();if(!body){say("Write the message first.");return}if(/___/.test(body)){say("Fill in the ___ first.");tplCaret($("#acBody"));return}
  t.disabled=true;try{await api("/admin/api/aoc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:$("#acTitle").value,body,to,push:$("#acPush").checked})});$("#acBody").value="";acPreview();say("AOC message sent to "+toLabel(to)+".",true);load()}catch(er){say(er.message)}finally{t.disabled=false}}
 else if(t.id==="send"){const to=toGet();if(to&&to.crew){if(!to.cs){say("Add the flight's callsign (for example PAW123).");return}}else if(to&&!to.pilot&&!to.cid){say("Add the pilot's ID (for example PAW0006) or VATSIM CID.");return}const body={id:S.edit||undefined,to,from:$("#from").value,subject:$("#subject").value,body:$("#body").value,keepAtt:S.keep};
  if($("#when").value==="later"){if(!$("#at").value){say("Pick when it goes out.");return}const at=$("#at").value;body.sendAt=new Date(at+(at.length===16?":00Z":"Z")).toISOString()}
  /* the attachments first, each as it is; one the server no longer has (an hour went by) goes up again, once */
  const post=async()=>{await attUp();body.attIds=S.add.map(f=>f.id);return api("/admin/api/mail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})};
  t.disabled=true;try{try{await post()}catch(er){if(er.status!==410)throw er;S.add.forEach(f=>{f.id=""});await post()}const was=S.edit,later=body.sendAt&&Date.parse(body.sendAt)>Date.now();reset();say(was?"Saved.":later?"Scheduled.":"Sent to "+toLabel(to)+".",true);load()}catch(er){say(er.message)}finally{t.disabled=false}}});
$("#when").addEventListener("change",()=>{$("#atRow").hidden=$("#when").value!=="later"});
document.querySelectorAll("input[name=kind]").forEach(x=>x.addEventListener("change",kindUi));$("#crCs").addEventListener("input",toUi);$("#crAdd").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();crAdd()}});["acTitle","acBody"].forEach(i=>$("#"+i).addEventListener("input",acPreview));
["subject","body","from"].forEach(i=>$("#"+i).addEventListener("input",preview));
document.querySelectorAll("input[name=to]").forEach(x=>x.addEventListener("change",toUi));["toPilot","toCid"].forEach(i=>$("#"+i).addEventListener("input",()=>{$("#toName").value="";$("#toCs").value="";toUi()}));
/* an attachment is kept as the file it is; it goes up on its own when the mail is sent (attUp), never as base64 */
const ATT_EXT={pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",txt:"text/plain"};
$("#file").addEventListener("change",e=>{try{for(const f of e.target.files){if(f.size>5242880){say(f.name+" is larger than 5 MB.");continue}
 S.add.push({name:f.name,type:f.type||ATT_EXT[String(f.name).split(".").pop().toLowerCase()]||"",size:f.size,file:f,id:""})}}
 catch(er){say("The file could not be added: "+((er&&er.message)||er))}finally{e.target.value=""}attsUi()});
/* each new attachment, uploaded (once: its id is kept for a second try of the same mail) */
async function attUp(){for(const f of S.add){if(f.id)continue;say("Uploading "+f.name+"…",true);
 const j=await api("/admin/api/mail/att",{method:"POST",headers:{"Content-Type":"application/octet-stream","X-Type":f.type||"application/octet-stream","X-Name":encodeURIComponent(f.name)},body:f.file,timeout:120000});f.id=j.att.id}}
/* ---------- Pilots tab ---------- */
const PL={list:null,err:""};
const ago=ms=>{if(!ms)return "—";const d=Math.round((Date.now()-ms)/60000);return d<1?"just now":d<60?d+" min ago":d<1440?Math.round(d/60)+" h ago":new Date(ms).toLocaleDateString(undefined,{dateStyle:"medium"})};
function plUi(){const q=($("#plFind").value||"").trim().toUpperCase(),L=(PL.list&&PL.list.pilots)||[];
 if(PL.err){$("#plSum").textContent="";$("#plList").innerHTML='<tr><td colspan="7"><div class="msg err">'+esc(PL.err)+'</div></td></tr>';return}
 if(!PL.list){$("#plList").innerHTML='<tr><td colspan="7" class="empty">Loading…</td></tr>';return}
 const signed=L.filter(p=>p.devices>0).length,used=L.filter(p=>p.last).length;
 $("#plSum").textContent=L.length+" pilot"+(L.length===1?"":"s")+(PL.list.roster?" in vAMSYS":" who signed in")+" · "+signed+" signed in to the EFB now · "+used+" have used it";
 const rows=L.filter(p=>!q||(p.u+" "+p.name+" "+p.cid).toUpperCase().includes(q));
 $("#plList").innerHTML=rows.length?rows.map(p=>'<tr class="'+(p.devices?"":"off")+(PL.sel===p.u?" sel":"")+'"><td class="pl-p"><button type="button" class="pl-open" data-plp="'+esc(p.u)+'" title="Open the profile"><b>'+esc(p.u)+'</b><span>'+esc(p.name)+'</span></button></td><td>'+esc(p.rank||"—")+'</td><td>'+esc(p.cid||"—")+'</td><td>'+(p.devices?'<span class="pl-s on">Signed in · '+p.devices+' device'+(p.devices>1?"s":"")+'</span>':p.last?'<span class="pl-s was">Signed out</span>':'<span class="pl-s no">Never</span>')+'</td><td>'+ago(p.first)+'</td><td>'+ago(p.last)+'</td><td class="pl-x"><button data-plmail="'+esc(p.u)+'" data-cid="'+esc(p.cid)+'" data-name="'+esc(p.name)+'">Message</button>'+(p.devices?'<button class="warn" data-plout="'+esc(p.u)+'">Sign out</button>':"")+'</td></tr>').join(""):'<tr><td colspan="7" class="empty">'+(L.length?"No pilot matches.":"No pilots yet.")+'</td></tr>'}
async function plLoad(){if(!pgHas("pilots"))return;PL.err="";plUi();try{PL.list=await api("/admin/api/pilots")}catch(e){PL.err=e.message}plUi();plProfUi()}
$("#plFind").addEventListener("input",plUi);
document.addEventListener("click",async e=>{const b=e.target.closest("[data-plout],[data-plmail]");if(!b)return;
 if(b.dataset.plmail!=null){window.pmCompose({pilot:b.dataset.plmail,cid:b.dataset.cid,cs:"",name:b.dataset.name});return}
 const u=b.dataset.plout;if(!confirm("Sign "+u+" out of the EFB on every device? They can sign in again with vAMSYS."))return;
 b.disabled=true;try{await api("/admin/api/pilots/signout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u})});$("#plMsg").innerHTML='<div class="msg ok">'+esc(u)+' was signed out.</div>';plLoad()}catch(er){$("#plMsg").innerHTML='<div class="msg err">'+esc(er.message)+'</div>';b.disabled=false}});
/* ---------- Inbox tab: pilots' conversations with a department ---------- */
/* The list is drawn again with every load (each minute, and after each change). The open conversation is not: its
   head (#ibHead) and its messages (#ibMsgs) each only when they changed, and its reply box (#ibForm) only for another
   conversation, so a reply being written (the text, the cursor, the focus, Reply as) and a reply on its way
   (IB.sending: Send stays off, a second press does nothing) outlive the minute's load. A reply not sent is kept for
   its conversation when another is opened (IB.drafts, IB.as).
   vTh: the conversation #ibView shows; hk, mk, fk: what its head, messages and reply box were drawn from */
const IB={threads:null,err:"",sel:"",show:"open",dept:"",depts:[],vTh:"",hk:"",mk:"",fk:"",drafts:{},as:{},sending:""};
const txt=s=>esc(s).replace(/(https?:\\/\\/[^\\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
function ibCount(){const n=(IB.threads||[]).filter(t=>!t.done&&t.waiting&&!t.read).length;["#ibCount","#cmIbN"].forEach(i=>{const b=$(i);if(b){b.hidden=!n;b.textContent=n}})}
function ibUi(){const L=(IB.threads||[]).filter(t=>(IB.show==="done")===t.done&&(!IB.dept||t.dept===IB.dept));
 if(IB.err){$("#ibList").innerHTML='<div class="msg err" style="margin:14px">'+esc(IB.err)+'</div>';return}
 if(!IB.threads){$("#ibList").innerHTML='<p class="empty" style="padding:16px 18px">Loading…</p>';return}
 $("#ibList").innerHTML=L.length?L.map(t=>{const last=t.msgs[t.msgs.length-1],nw=t.waiting&&!t.read;return '<button class="ib-t'+(t.th===IB.sel?" on":"")+(nw?" new":"")+'" data-ib="'+esc(t.th)+'"><b>'+(nw?'<span class="ib-dot"></span>':"")+esc(t.subj)+'</b><time>'+ago(last.t)+'</time><span class="meta">'+esc(t.pilot)+(t.name?" · "+esc(t.name):"")+" → "+esc(t.dept)+(t.waiting&&!t.done?'<span class="ib-w">AWAITING REPLY</span>':"")+'</span></button>'}).join(""):'<p class="empty" style="padding:16px 18px">'+(IB.show==="done"?"No conversations marked done.":"Nothing waiting. Messages pilots send to a department arrive here.")+'</p>';
 const t=(IB.threads||[]).find(x=>x.th===IB.sel);if(!t)return;
 if(IB.vTh!==t.th||!$("#ibForm")){ibKeep();$("#ibView").innerHTML='<div class="ib-view"><div class="ib-vh" id="ibHead"></div><div class="ib-ms" id="ibMsgs"></div><div class="ib-r" id="ibForm"></div></div>';IB.vTh=t.th;IB.hk=IB.mk=IB.fk=""}
 const hk=JSON.stringify([t.subj,t.pilot,t.name,t.cs,t.dept,!!t.done]);
 if(IB.hk!==hk){IB.hk=hk;$("#ibHead").innerHTML='<div><h3>'+esc(t.subj)+'</h3><div class="meta">'+esc(t.pilot)+(t.name?" · "+esc(t.name):"")+(t.cs?" · "+esc(t.cs):"")+" → "+esc(t.dept)+'</div></div><div class="actions" style="margin:0"><button data-ibdone="'+(t.done?0:1)+'">'+(t.done?"Reopen":"Mark done")+'</button><button type="button" class="cm-x" data-cmclose aria-label="Close">✕</button></div>'}
 const mk=JSON.stringify([t.pilot,t.name,t.msgs.map(m=>[m.t,m.kind,m.from,m.by,m.cs,m.body])]);
 if(IB.mk!==mk){IB.mk=mk;$("#ibMsgs").innerHTML=t.msgs.map(m=>'<div class="ib-m'+(m.kind==="reply"?" st":"")+'"><div class="who"><b>'+esc(m.kind==="reply"?m.from:(t.pilot+(t.name?" · "+t.name:"")))+'</b>'+(m.kind==="reply"&&m.by?" · "+esc(m.by):"")+(m.cs&&m.kind!=="reply"?" · "+esc(m.cs):"")+" · "+fmt(m.t)+'</div><p>'+txt(m.body)+'</p></div>').join("")}
 ibForm(t)}
/* the reply being written in the conversation shown, kept for when it is opened again */
function ibKeep(){if(!IB.vTh)return;const b=$("#ibBody"),a=$("#ibAs");if(b)IB.drafts[IB.vTh]=b.value;if(a)IB.as[IB.vTh]=a.value}
const ibSendUi=()=>{const s=$("#ibSend");if(s)s.disabled=!!IB.sending};
/* the reply box: drawn for a conversation once. Drawn again for the same one only when what it offers changed (the
   departments to reply as), and then with what was in it: the text, the cursor and the focus, Reply as, the last note */
function ibForm(t){const k=JSON.stringify([t.th,t.pilot,IB.depts]);if(IB.fk===k&&$("#ibBody")){ibSendUi();return}
 const ob=$("#ibBody"),oa=$("#ibAs"),om=$("#ibMsg"),ae=document.activeElement;
 const keep=ob?{v:ob.value,s:ob.selectionStart,e:ob.selectionEnd,fb:ae===ob,fa:!!oa&&ae===oa,as:oa?oa.value:"",m:om?om.innerHTML:""}:null;
 const as0=keep?keep.as:IB.as[t.th]||"",as=IB.depts.includes(as0)?as0:t.dept;
 $("#ibForm").innerHTML='<label for="ibBody">Reply to '+esc(t.pilot)+'</label><textarea id="ibBody" maxlength="4000" placeholder="Your reply goes to this pilot\u2019s EFB Mail."></textarea><div class="row" style="margin-top:10px"><div style="flex:0 1 240px"><label for="ibAs" style="margin-top:0">Reply as</label><select id="ibAs">'+IB.depts.map(d=>'<option'+(d===as?" selected":"")+'>'+esc(d)+'</option>').join("")+'</select></div><div style="flex:0 0 auto;align-self:end"><button class="primary" id="ibSend">Send reply</button></div></div><div id="ibMsg"></div>';
 IB.fk=k;const nb=$("#ibBody");nb.value=keep?keep.v:IB.drafts[t.th]||"";
 if(keep){$("#ibMsg").innerHTML=keep.m;if(keep.fb){nb.focus();try{nb.setSelectionRange(keep.s,keep.e)}catch(x){}}else if(keep.fa)$("#ibAs").focus()}
 ibSendUi()}
async function ibLoad(){if(!pgHas("comms"))return;const q=IB.lq=(IB.lq||0)+1;IB.err="";try{const j=await api("/admin/api/inbox");if(q!==IB.lq)return;IB.threads=j.threads;IB.depts=j.depts||[];const sel=$("#ibDept");if(sel.options.length<2)sel.insertAdjacentHTML("beforeend",IB.depts.map(d=>'<option>'+esc(d)+'</option>').join(""))}catch(e){if(q!==IB.lq)return;IB.err=e.message}ibCount();ibUi();if(pgNow==="home")hmUi()}
$("#ibDept").addEventListener("change",e=>{IB.dept=e.target.value;ibUi()});
document.addEventListener("click",async e=>{const b=e.target.closest("[data-ib],[data-ibs],[data-ibdone],#ibSend");if(!b)return;
 if(b.dataset.ibs){IB.show=b.dataset.ibs;document.querySelectorAll("[data-ibs]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));ibUi();return}
 if(b.dataset.ib){IB.sel=b.dataset.ib;const t=IB.threads.find(x=>x.th===IB.sel);ibUi();if(innerWidth<900)requestAnimationFrame(()=>{const v=$("#ibView");if(v&&!v.hidden)v.scrollIntoView({behavior:"smooth",block:"start"})});if(t&&!t.read){t.read=true;ibCount();ibUi();api("/admin/api/inbox/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({th:t.th,read:true})}).catch(()=>{})}return}
 const t=(IB.threads||[]).find(x=>x.th===IB.sel);if(!t)return;
 if(b.dataset.ibdone!=null){try{await api("/admin/api/inbox/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({th:t.th,done:b.dataset.ibdone==="1"})});await ibLoad()}catch(er){alert(er.message)}return}
 /* one reply on its way at a time: Send is off until it is answered, whatever the minute's load draws meanwhile */
 if(b.id==="ibSend"){if(IB.sending)return;const tb=$("#ibBody"),body=tb?tb.value.trim():"";if(!body){$("#ibMsg").innerHTML='<div class="msg err">Write a reply first.</div>';return}
  const th=t.th,pilot=t.pilot,dept=$("#ibAs").value;IB.sending=th;ibSendUi();$("#ibMsg").innerHTML="";let er=null;
  try{await api("/admin/api/inbox/reply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({th,dept,body})})}catch(x){er=x}
  IB.sending="";
  /* sent: the box is emptied, unless more was written in it meanwhile */
  if(!er){if(String(IB.drafts[th]||"").trim()===body)delete IB.drafts[th];const x=IB.vTh===th&&$("#ibBody");if(x&&x.value.trim()===body)x.value=""}
  ibSendUi();if(!er)await ibLoad();
  const m=IB.vTh===th&&$("#ibMsg");if(m)m.innerHTML=er?'<div class="msg err">'+esc(er.message)+'</div>':'<div class="msg ok">Sent to '+esc(pilot)+'.</div>'}});
if(!document.querySelector(".deny")){if(!["comms","home"].includes(pgOf()))ibLoad();setInterval(()=>{if(!document.hidden)ibLoad()},60000)}
PG_LOAD.pilots=()=>plLoad();
/* ---------- Documents tab: manuals and SOPs for the EFB's Documents ---------- */
const DC={list:null,err:"",edit:null,file:null,cover:"",pages:0,busy:false,piece:8388608,fileMax:104857600};
let dcLibP=null;
/* pdf.js, the same build the EFB uses: reads the page count and draws the cover */
function dcLib(){if(dcLibP)return dcLibP;const add=src=>new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=()=>rej(new Error("the PDF reader couldn’t load"));document.head.appendChild(s)});
 dcLibP=add("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js").then(()=>add("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js")).then(()=>window.pdfjsLib).catch(e=>{dcLibP=null;throw e});return dcLibP}
const dcSay=(t,ok)=>{$("#dcMsg").innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
const dcId=()=>{const a=new Uint8Array(9);crypto.getRandomValues(a);return Array.from(a,b=>(b%36).toString(36)).join("")+Date.now().toString(36).slice(-4)};
const dcDoc=id=>((DC.list&&DC.list.docs)||[]).find(d=>d.id===id);
function dcProg(f){const p=$("#dcProg");p.hidden=f==null;if(f!=null)p.firstElementChild.style.width=Math.round(Math.max(0,Math.min(1,f))*100)+"%"}
function dcBusy(on){["dcFile","dcTitle","dcFolder","dcRev","dcAck","dcSave","dcCancel"].forEach(i=>{const e=$("#"+i);if(e)e.disabled=on});$("#dcSave").textContent=on?"Uploading…":DC.edit?"Save changes":"Upload";if(!on)dcProg(null)}
function dcForm(){const d=DC.edit?dcDoc(DC.edit):null;$("#dcFormTitle").textContent=d?"Edit document":"Add a document";$("#dcFileL").firstChild.textContent=d?"Replace the file (optional) ":"PDF file ";
 $("#dcSave").textContent=d?"Save changes":"Upload";$("#dcCancel").hidden=!d}
function dcReset(){DC.edit=null;DC.file=null;DC.cover="";DC.pages=0;["dcFile","dcTitle","dcFolder","dcRev"].forEach(i=>$("#"+i).value="");$("#dcAck").checked=false;$("#dcPre").hidden=true;dcForm();dcUi()}
/* one piece, with upload progress */
function dcPut(url,blob,onp){return new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open("POST",url);x.setRequestHeader("Content-Type","application/octet-stream");
 x.timeout=120000;x.ontimeout=()=>rej(new Error("This piece took more than 2 minutes to upload. Check the connection and try again."));
 x.upload.onprogress=e=>onp(e.loaded);x.onload=()=>{let j=null;try{j=JSON.parse(x.responseText)}catch(e){}if(x.status>=200&&x.status<300)res(j);else rej(new Error((j&&j.error)||("HTTP "+x.status)))};
 x.onerror=()=>rej(new Error("The upload was cut off. Check the connection and try again."));x.send(blob)})}
$("#dcFile").addEventListener("change",async e=>{const f=e.target.files[0];DC.file=null;DC.cover="";DC.pages=0;$("#dcPre").hidden=true;if(!f)return;
 if(f.type!=="application/pdf"&&!/[.]pdf$/i.test(f.name)){dcSay("Pick a PDF file.");e.target.value="";return}
 if(f.size>DC.fileMax){dcSay(f.name+" is larger than "+Math.round(DC.fileMax/1048576)+" MB.");e.target.value="";return}
 DC.file=f;dcSay("");$("#dcPre").hidden=false;$("#dcPName").textContent=f.name;$("#dcPMeta").textContent=kb(f.size)+" · reading…";$("#dcCov").removeAttribute("src");
 if(!$("#dcTitle").value.trim())$("#dcTitle").value=f.name.replace(/[.]pdf$/i,"").replace(/_+/g," ").trim();
 let task=null;try{const lib=await dcLib();task=lib.getDocument({data:await f.arrayBuffer(),isEvalSupported:false});const doc=await task.promise;if(DC.file!==f)return;DC.pages=doc.numPages;
  const pg=await doc.getPage(1),v=pg.getViewport({scale:1}),vp=pg.getViewport({scale:Math.min(480/v.width,640/v.height)}),c=document.createElement("canvas");
  c.width=Math.round(vp.width);c.height=Math.round(vp.height);const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:g,viewport:vp}).promise;if(DC.file!==f)return;
  let q=.82,url=c.toDataURL("image/jpeg",q);while(url.length*.75>380000&&q>.4){q-=.15;url=c.toDataURL("image/jpeg",q)}
  DC.cover=url;$("#dcCov").src=url;$("#dcPMeta").textContent=kb(f.size)+" · "+DC.pages+" page"+(DC.pages===1?"":"s")}
 catch(er){if(DC.file===f)$("#dcPMeta").textContent=kb(f.size)+" · no preview ("+er.message+"); it can still be uploaded"}
 finally{if(task)try{task.destroy()}catch(x){}}});
async function dcSave(){if(DC.busy)return;const old=DC.edit?dcDoc(DC.edit):null,title=$("#dcTitle").value.trim();
 if(DC.edit&&!old){dcReset();dcSay("That document is no longer there.");return}
 if(!old&&!DC.file){dcSay("Pick a PDF file first.");return}if(!title){dcSay("Give the document a title.");return}
 DC.busy=true;dcBusy(true);dcSay("");
 try{const body={id:old?old.id:dcId(),title,folder:$("#dcFolder").value.trim(),rev:$("#dcRev").value.trim(),ack:$("#dcAck").checked};
  if(DC.file){const f=DC.file,v=old?old.v+1:1,n=Math.ceil(f.size/DC.piece);let sent=0;dcProg(0);
   for(let i=0;i<n;i++){const part=f.slice(i*DC.piece,Math.min(f.size,(i+1)*DC.piece));
    for(let tries=1;;tries++){try{await dcPut("/admin/api/docs/piece?id="+body.id+"&v="+v+"&i="+i+"&size="+f.size,part,l=>dcProg((sent+l)/f.size));break}
     catch(er){if(tries>=3||/not a PDF|larger than|Not enough room|changed meanwhile|already|expired|signed in/i.test(er.message))throw er;await new Promise(r=>setTimeout(r,1500*tries))}}
    sent+=part.size;dcProg(sent/f.size)}
   body.file={v,name:f.name,size:f.size,pages:DC.pages,n};if(DC.cover)body.cover=DC.cover.split(",")[1]}
  await api("/admin/api/docs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const msg=old?(body.file?"Replaced. Pilots get the new version the next time their Documents check.":"Saved."):"Uploaded. Pilots see it in Flight › Documents › Polaris Airways.";
  DC.busy=false;dcBusy(false);dcReset();dcSay(msg,true);await dcLoad()}
 catch(er){dcSay(er.message)}finally{DC.busy=false;dcBusy(false)}}
function dcUi(){const L=(DC.list&&DC.list.docs)||[];
 if(DC.err){$("#dcList").innerHTML='<div class="msg err">'+esc(DC.err)+"</div>";return}
 if(!DC.list){$("#dcList").innerHTML='<span class="empty">Loading…</span>';return}
 $("#dcAckErr").innerHTML=DC.list.acksErr?'<div class="msg err">'+esc(DC.list.acksErr)+"</div>":"";$("#dcUse").textContent=L.length+" document"+(L.length===1?"":"s")+" · "+(DC.list.used?kb(DC.list.used):"0 KB")+" of "+Math.round(DC.list.max/1048576)+" MB used";
 const folders=[...new Set(L.map(d=>d.folder||""))];$("#dcFolders").innerHTML=folders.filter(Boolean).map(f=>'<option value="'+esc(f)+'">').join("");
 $("#dcList").innerHTML=L.length?folders.map(f=>'<div class="dc-f">'+esc(f||"No folder")+"</div>"+L.filter(d=>(d.folder||"")===f).map(d=>'<div class="dc-d'+(DC.edit===d.id?" on":"")+'">'
  +'<span class="dc-c">'+(d.cover?'<img src="/admin/api/docs/cover?id='+encodeURIComponent(d.id)+"&v="+d.v+'" alt="" loading="lazy">':"PDF")+"</span>"
  +"<div><b>"+esc(d.title)+"</b>"+(d.rev?'<span class="tag d">'+esc(d.rev)+"</span>":"")+'</div><div class="meta">'+[d.pages?d.pages+" pages":"",kb(d.size),"v"+d.v,"Updated "+fmt(d.up||d.t)+(d.upBy?" by "+esc(d.upBy):"")].filter(Boolean).join(" · ")+"</div>"
  +dcAckHtml(d)+'<div class="btns"><a class="btnl" href="/admin/api/docs/file?id='+encodeURIComponent(d.id)+'" target="_blank" rel="noopener">Open</a><button data-dcedit="'+esc(d.id)+'">Edit</button><button data-dcrep="'+esc(d.id)+'">Replace file</button><button class="warn" data-dcdel="'+esc(d.id)+'">Delete</button></div></div>').join("")).join("")
  :'<p class="empty">No documents yet. Upload a manual or an SOP on the left; pilots see it in the EFB under Flight › Documents.</p>'}
async function dcLoad(){if(!pgHas("docs"))return;DC.err="";if(!PL.list)api("/admin/api/pilots").then(j=>{if(!PL.list){PL.list=j;dcUi()}}).catch(()=>{});try{const j=await api("/admin/api/docs");DC.list=j;DC.piece=j.piece||DC.piece;DC.fileMax=j.fileMax||DC.fileMax}catch(e){DC.err=e.message}dcUi()}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-dcedit],[data-dcrep],[data-dcdel],#dcSave,#dcCancel");if(!b)return;
 if(b.id==="dcSave"){dcSave();return}if(b.id==="dcCancel"){dcReset();dcSay("");return}
 const id=b.dataset.dcedit||b.dataset.dcrep||b.dataset.dcdel,d=dcDoc(id);if(!d||DC.busy)return;
 if(b.dataset.dcdel){if(!confirm('Delete "'+d.title+'"? Pilots will no longer see it, and the copies on their devices are removed the next time their Documents check.'))return;
  b.disabled=true;try{await api("/admin/api/docs?id="+encodeURIComponent(id),{method:"DELETE"});if(DC.edit===id)dcReset();dcSay("Deleted.",true);await dcLoad()}catch(er){dcSay(er.message);b.disabled=false}return}
 DC.edit=id;DC.file=null;DC.cover="";DC.pages=0;$("#dcFile").value="";$("#dcPre").hidden=true;$("#dcTitle").value=d.title;$("#dcFolder").value=d.folder||"";$("#dcRev").value=d.rev||"";$("#dcAck").checked=!!d.ack;dcForm();dcUi();dcSay("");
 scrollTo({top:0,behavior:"smooth"});if(b.dataset.dcrep)$("#dcFile").click();else $("#dcTitle").focus()});
PG_LOAD.docs=()=>dcLoad();
/* ---------- Gates (Nov 2026): the gate plan of each airport drawn on its map from OpenStreetMap, the rules, a try-out,
   and the gates sent in the last two days (stands.js on the server). Whether the gate messages go out, when, and
   their wording are on the Automatic messages page. ---------- */
const ST={plan:null,saved:null,log:[],apts:{},sel:"",dirty:false,maps:{},busy:{},err:"",view:"map",logAll:false,ed:-1,pop:"",q:"",tryAc:"narrow",tryFl:"intl",tryRes:null,M:null,ready:false,chgBusy:new Set()};
const stZ=t=>{const d=new Date(t);return String(d.getUTCHours()).padStart(2,"0")+String(d.getUTCMinutes()).padStart(2,"0")+"Z"};
const stSay=(t,ok)=>{const m=$("#stMsg");if(m)m.innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
const stClone=v=>JSON.parse(JSON.stringify(v));
const stCan=()=>!PERM||PERM.can.has("gates");
/* the same reading of "C1-C10, D5" as the server */
function stExpand(text){const out=[],bad=[];for(let p of String(text||"").toUpperCase().split(/[,;]+/)){p=p.replace(/ /g,"");if(!p)continue;
 const m=p.match(/^([A-Z]*)([0-9]+)([A-Z]*)[-–~]([A-Z]*)([0-9]+)([A-Z]*)$/);
 if(m){const a=+m[2],b=+m[5];if((m[4]&&m[4]!==m[1])||(m[6]&&m[6]!==m[3])||b<a||b-a>200){bad.push(p);continue}const w=m[2].length>1&&m[2][0]==="0"?m[2].length:0;for(let n=a;n<=b;n++)out.push(m[1]+(w?String(n).padStart(w,"0"):String(n))+m[3])}
 else if(/^[A-Z0-9]{1,8}$/.test(p))out.push(p);else bad.push(p)}return {stands:[...new Set(out)],bad}}
const stNorm=r=>String(r||"").toUpperCase().replace(/^(GATE|STAND|STAND NO.?|GATE NO.?) */,"").replace(/ /g,"").replace(/(^|[A-Z])0+([0-9])/g,"$1$2");
/* a list of gates written short again: C1, C2, C3, C5 -> C1-C3, C5 (what the map's clicks write into a rule) */
function stCompress(list){const G=new Map(),other=[],pad=new Map();
 const P=list.map(s=>String(s).toUpperCase()).map(s=>[s,s.match(/^([A-Z]*)([0-9]+)([A-Z]*)$/)]);
 for(const [,m] of P)if(m&&m[2].length>1&&m[2][0]==="0")pad.set(m[1]+"|"+m[3],m[2].length);
 for(const [s,m] of P){if(!m){other.push(s);continue}const pw=pad.get(m[1]+"|"+m[3]),w=m[2].length>1&&m[2][0]==="0"?m[2].length:pw&&m[2].length===pw?pw:0,k=m[1]+"|"+m[3]+"|"+w;
  if(!G.has(k))G.set(k,{p:m[1],s:m[3],w,n:new Set()});G.get(k).n.add(+m[2])}
 const out=[],f=(g,n)=>g.p+(g.w?String(n).padStart(g.w,"0"):String(n))+g.s;
 for(const g of G.values()){const N=[...g.n].sort((a,b)=>a-b);for(let i=0;i<N.length;){let j=i;while(j+1<N.length&&N[j+1]===N[j]+1&&N[j+1]-N[i]<=200)j++;
  if(j-i>=2)out.push(f(g,N[i])+"-"+f(g,N[j]));else for(let k=i;k<=j;k++)out.push(f(g,N[k]));i=j+1}}
 return out.concat([...new Set(other)]).join(", ")}
const stNat=(a,b)=>{const x=String(a).match(/^([A-Z]*)([0-9]*)(.*)$/),y=String(b).match(/^([A-Z]*)([0-9]*)(.*)$/);return x[1].localeCompare(y[1])||(+x[2]||0)-(+y[2]||0)||x[3].localeCompare(y[3])};
/* the rule colours: eight slots in a fixed order; a ninth rule and later share one */
const stCol=k=>k<8?"r"+k:"rx";
const ST_FL={all:"Any flight",dom:"Domestic",intl:"International"},ST_AC={all:"Any size",narrow:"Normal",wide:"Heavy"};
const stRuleSum=r=>ST_AC[r.ac||"all"]+" · "+ST_FL[r.fl||"all"];
const stRules=()=>(ST.plan&&ST.plan.apts[ST.sel])||[];
const stSets=()=>stRules().map(r=>new Set(stExpand(r.stands).stands.map(stNorm)));
const stAptName=i=>(ST.apts[i]||[])[3]||(ST.maps[i]&&ST.maps[i].name)||"";
/* the plan's two halves are saved apart (stands.js): Gates sends only its gates (part "apts"), Automatic messages only
   the switches it changes (part "sw"); the server keeps the other half as it has it. base: when the half this page
   changed was last saved, as the page read it, so a save over someone else's newer one is refused (409), not lost.
   Gates' base is the plan its edits started from (ST.plan), not the one the last reload brought (ST.saved) */
const stAt=(v,k)=>v&&typeof v[k+"At"]==="number"?v[k+"At"]:(v&&v.at)||0;
const stBody=()=>({part:"apts",base:stAt(ST.plan,"apts"),apts:ST.plan.apts});
const auBody=patch=>({part:"sw",base:stAt(ST.saved,"sw"),...patch});
/* gates given to Polaris flights around now (a ring on the map) */
function stGiven(i){const now=Date.now(),G=new Map();for(const x of ST.log){if(!x.stand||(x.kind==="dep"?x.dep:x.arr)!==i)continue;const t=x.eta||x.t;if(t<now-45*6e4||t>now+12*36e5)continue;const n=stNorm(x.stand),o=G.get(n);if(!o||Math.abs(t-now)<Math.abs((o.eta||o.t)-now))G.set(n,x)}return G}
const stVat=i=>(ST.busy[i]&&ST.busy[i].vat)||new Set();
async function stBusy(i,force){if(!i)return;const b=ST.busy[i];if(!force&&b&&Date.now()-b.at<6e4)return;
 try{const j=await api("/admin/api/stands/busy?icao="+encodeURIComponent(i));ST.busy[i]={vat:new Set(j.vat||[]),at:Date.now()}}catch(e){ST.busy[i]={vat:new Set(),at:Date.now()}}
 if(ST.sel===i&&pgNow==="gates")stMapRefresh()}
function stStateUi(){const v=ST.saved,el=$("#stState");if(!el||!v)return;const b=(on,t)=>"<span>"+t+' <span class="bdg '+(on?"on":"off")+'">'+(on?"On":"Off")+"</span></span>";
 el.innerHTML=b(v.on,"Arrival gate")+b(v.dep,"Departure gate")+'<a class="lk au-lk" href="#auto">Automatic messages ›</a>'}
function stAptsUi(){const el=$("#stApts");if(!el||!ST.plan)return;const P=ST.plan.apts,q=ST.q.trim().toUpperCase(),all=[...new Set([...Object.keys(P),...Object.keys(ST.apts)])];
 const L=all.filter(i=>!q||i.includes(q)||stAptName(i).toUpperCase().includes(q)).sort((a,b)=>((P[b]||[]).length>0)-((P[a]||[]).length>0)||a.localeCompare(b));
 let h=L.map(i=>{const n=(P[i]||[]).length;return '<button type="button" class="ga'+(n?" has":"")+'" data-sta="'+esc(i)+'" aria-pressed="'+(i===ST.sel)+'"><b>'+esc(i)+"</b><span>"+esc(stAptName(i))+"</span><small>"+(n?n+(n===1?" rule":" rules"):"No rules")+"</small></button>"}).join("");
 if(/^[A-Z0-9]{4}$/.test(q)&&!all.includes(q))h+='<button type="button" class="ga add" data-staadd="'+esc(q)+'"><b>'+esc(q)+"</b><span>Add this airport</span><small>+</small></button>";
 el.innerHTML=h||'<p class="empty" style="padding:6px 9px">No airport matches. Type its 4-letter ICAO code to add it.</p>'}
function stPick(i){ST.sel=i;ST.ed=-1;ST.pop="";ST.tryRes=null;ST.M=null;stAptsUi();stMainUi();stMap(i);stBusy(i);stLogUi()}

/* ---- the airport map ---- */
async function stMap(i){if(!i||ST.maps[i])return;ST.maps[i]={loading:true};if(ST.sel===i)stMainUi();
 try{const r=await fetch("/api/efb/airport-layout?icao="+encodeURIComponent(i));const j=await r.json();if(!r.ok)throw new Error(j.error||"HTTP "+r.status);ST.maps[i]=stMapMake(j)}
 catch(e){ST.maps[i]={err:"The airport map could not be read, so the gates are shown from the rules alone."}}
 if(ST.sel===i){ST.M=null;stMainUi();stAptsUi()}}
/* the map drawn once per airport, in metres from the airport's reference point (x east, y south) */
function stMapMake(L){const a=L.airport||{};if(L.notFound||!isFinite(a.lat)||!isFinite(a.lon))return {none:true,name:a.name||""};
 const lat0=a.lat,lon0=a.lon,cx=Math.cos(lat0*Math.PI/180)*111320,P=p=>[Math.round((p[0]-lon0)*cx),Math.round((lat0-p[1])*110574)];
 const d=pts=>pts.map((p,k)=>{const q=P(p);return (k?"L":"M")+q[0]+" "+q[1]}).join(""),ring=pts=>d(pts)+"Z";
 let base="";const labs=[];
 (L.outline||[]).forEach(r=>{base+='<path class="m-f" d="'+ring(r)+'"/>'});
 (L.aprons||[]).forEach(r=>{base+='<path class="m-a" d="'+ring(r)+'"/>'});
 (L.apronHoles||[]).forEach(r=>{base+='<path class="m-f" d="'+ring(r)+'"/>'});
 (L.taxiways||[]).forEach(t=>{base+='<path class="m-t" d="'+d(t.pts)+'"/>'});
 (L.runways||[]).forEach(r=>{if(!r.pts||r.pts.length<2)return;if(r.area){base+='<path class="m-ra" d="'+ring(r.pts)+'"/>';return}base+='<path class="m-r'+(r.stopway?" s":"")+'" stroke-width="'+(r.width||45)+'" d="'+d(r.pts)+'"/>';
  if(r.ref&&!r.stopway){const p=P(r.pts[0]),q=P(r.pts[r.pts.length-1]);labs.push({x:(p[0]+q[0])/2,y:(p[1]+q[1])/2,t:r.ref,c:"rw"})}});
 (L.buildings||[]).forEach(b=>{base+='<path class="m-b'+(b.kind==="terminal"?" t":"")+'" fill-rule="evenodd" d="'+ring(b.pts)+(b.holes||[]).map(ring).join("")+'"/>';
  if(b.name&&b.kind==="terminal"){let x=0,y=0;b.pts.forEach(p=>{const q=P(p);x+=q[0];y+=q[1]});labs.push({x:x/b.pts.length,y:y/b.pts.length,t:b.name,c:""})}});
 const S=[],by=new Map(),nr=[];
 for(const s of L.stands||[]){if(!s.pt)continue;const q=P(s.pt),n=stNorm(s.ref);if(!n||n.length>8){nr.push(q);continue}
  const o=by.get(n);if(o){if(s.kind==="parking_position"&&o.kind!=="parking_position"){o.x=q[0];o.y=q[1];o.kind=s.kind}continue}
  const v={n,x:q[0],y:q[1],kind:s.kind};by.set(n,v);S.push(v)}
 S.sort((p,q)=>stNat(p.n,q.n));
 /* how close stands stand: the median distance to the nearest one decides when the numbers fit */
 const nn=S.map(s=>{let b=1e9;for(const t of S)if(t!==s){const e=Math.hypot(t.x-s.x,t.y-s.y);if(e<b)b=e}return b}).filter(v=>v<1e9).sort((p,q)=>p-q);
 const med=nn.length?nn[nn.length>>1]:60;
 const pts=S.length>1?S.map(s=>[s.x,s.y]):[].concat(...(L.runways||[]).map(r=>(r.pts||[]).map(P)));
 const bb=pts.length?pts.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[1e9,1e9,-1e9,-1e9]):[-1500,-1500,1500,1500];
 return {name:a.name||"",S,refs:new Set(S.map(s=>s.n)),nr,base,labs,med,bb}}
function stFit(W,H){const m=ST.maps[ST.sel],b=m.bb,bw=Math.max(200,b[2]-b[0]),bh=Math.max(200,b[3]-b[1]),k=Math.max(.01,Math.min(4,(W-70)/bw,(H-70)/bh));
 ST.M={i:ST.sel,k,tx:W/2-k*(b[0]+b[2])/2,ty:H/2-k*(b[1]+b[3])/2,W,H}}
function stZoomTo(k2,px,py){const M=ST.M;if(!M)return;k2=Math.max(.01,Math.min(8,k2));M.tx=px-(px-M.tx)*(k2/M.k);M.ty=py-(py-M.ty)*(k2/M.k);M.k=k2;gmMove(true)}
function stOvHtml(m,M,W,H){const i=ST.sel,sets=stSets(),vat=stVat(i),giv=stGiven(i),hl=ST.tryRes&&ST.tryRes.stand?stNorm(ST.tryRes.stand):"";
 const dm=m.med*M.k,R=dm>=24?7:dm>=13?5:3.5,lab=dm>=30,inV=(X,Y)=>X>-30&&X<W+30&&Y>-30&&Y<H+30;let h="";
 for(const l of m.labs){const X=M.k*l.x+M.tx,Y=M.k*l.y+M.ty;if(inV(X,Y)&&(l.c!=="rw"||M.k>.12))h+='<text class="ml '+l.c+'" x="'+X.toFixed(1)+'" y="'+Y.toFixed(1)+'">'+esc(l.t)+"</text>"}
 if(dm>=13)for(const q of m.nr){const X=M.k*q[0]+M.tx,Y=M.k*q[1]+M.ty;if(inV(X,Y))h+='<circle class="nr" r="1.8" cx="'+X.toFixed(1)+'" cy="'+Y.toFixed(1)+'"/>'}
 for(const s of m.S){const X=M.k*s.x+M.tx,Y=M.k*s.y+M.ty;if(!inV(X,Y))continue;
  const k=sets.findIndex(z=>z.has(s.n)),c=k<0?"rn":stCol(k),oc=vat.has(s.n),g=giv.get(s.n),on=ST.pop===s.n;
  h+='<g class="gs'+(on?" on":"")+'" data-sn="'+esc(s.n)+'" transform="translate('+X.toFixed(1)+" "+Y.toFixed(1)+')"><circle class="hit" r="'+Math.max(R+6,11)+'"/>'
   +(s.n===hl?'<circle class="hl" r="'+(R+8)+'"/>':"")+(g?'<circle class="gv '+c+'" r="'+(R+4)+'"/>':"")
   +(oc?'<circle class="oc" r="'+(R+1)+'"/><path class="ox" d="M-3 -3L3 3M3 -3L-3 3"/>':'<circle class="d '+c+'" r="'+R+'"/>')
   +(R>=7&&k>=0&&!oc?'<text class="dn '+c+'" y="3.2">'+(k+1)+"</text>":"")
   +(lab||s.n===hl||on?'<text class="lb" y="'+(R+12)+'">'+esc(s.n)+"</text>":"")+"</g>"}
 return h}
const GM={p:new Map(),down:null,moved:false,pinch:null,raf:0,mraf:0,at:null,settle:0};
function gmDraw(){if(GM.raf)return;GM.raf=requestAnimationFrame(()=>{GM.raf=0;stMapDraw()})}
/* (P2, Nov 2026) while the map is dragged or zoomed, each frame only moves what is drawn: the map's own transform, and
   the stands' layer scaled and moved from where it was drawn (GM.at), with no layout read and no layer written again.
   The layer is drawn again when the drag ends, or 180 ms after the last zoom (settle) */
function gmMove(settle){const M=ST.M;if(!M)return;
 if(!GM.at){gmDraw();return}
 if(!GM.mraf)GM.mraf=requestAnimationFrame(()=>{GM.mraf=0;const M=ST.M,A=GM.at,b=$("#stBase"),ov=$("#stOv");if(!M||!A||!b||!ov)return;
  b.setAttribute("transform","matrix("+M.k+" 0 0 "+M.k+" "+M.tx.toFixed(2)+" "+M.ty.toFixed(2)+")");
  const s=M.k/A.k;ov.setAttribute("transform","matrix("+s+" 0 0 "+s+" "+(M.tx-s*A.tx).toFixed(2)+" "+(M.ty-s*A.ty).toFixed(2)+")");
  const pop=$("#stPop");if(pop&&!pop.hidden)pop.hidden=true});
 if(settle){clearTimeout(GM.settle);GM.settle=setTimeout(()=>{GM.settle=0;if(!GM.down)stMapDraw()},180)}}
function stMapDraw(){const svg=$("#stSvg"),box=$("#stGm");if(!svg||!box)return;const m=ST.maps[ST.sel];if(!m||!m.S)return;
 const W=box.clientWidth||800,H=W<600?360:470;svg.setAttribute("viewBox","0 0 "+W+" "+H);svg.style.height=H+"px";
 if(!ST.M||ST.M.i!==ST.sel)stFit(W,H);else if(ST.M.W!==W||ST.M.H!==H){ST.M.tx+=(W-ST.M.W)/2;ST.M.ty+=(H-ST.M.H)/2;ST.M.W=W;ST.M.H=H}
 const M=ST.M;$("#stBase").setAttribute("transform","matrix("+M.k+" 0 0 "+M.k+" "+M.tx.toFixed(2)+" "+M.ty.toFixed(2)+")");
 const ov=$("#stOv");ov.removeAttribute("transform");ov.innerHTML=stOvHtml(m,M,W,H);GM.at={k:M.k,tx:M.tx,ty:M.ty};
 const pop=$("#stPop"),s=ST.pop&&m.S.find(x=>x.n===ST.pop);
 if(!s){pop.hidden=true;pop.innerHTML="";return}
 const X=M.k*s.x+M.tx,Y=M.k*s.y+M.ty;if(X<0||X>W||Y<0||Y>H){pop.hidden=true;return}
 pop.innerHTML=stPopHtml(ST.pop);pop.hidden=false;const pw=pop.offsetWidth,ph=pop.offsetHeight;
 pop.style.left=Math.max(6,X+18+pw>W-6?X-18-pw:X+18)+"px";pop.style.top=Math.max(6,Math.min(H-ph-6,Y-24))+"px"}
/* what a stand is: its rules, VATSIM, a Polaris flight; and, for those who may change gates, into or out of a rule */
function stPopHtml(n){const i=ST.sel,R=stRules(),sets=stSets(),g=stGiven(i).get(n),ins=R.map((r,k)=>sets[k].has(n)?k:-1).filter(k=>k>=0),f=ins[0];
 let h='<div class="gp-h"><b>'+esc(n)+"</b>"+(f!=null&&R[f].term?'<span class="lbl">· '+esc(R[f].term)+"</span>":"")+'<button type="button" class="gp-x" data-gpx aria-label="Close">✕</button></div>';
 h+=ins.length?ins.map((k,x)=>'<div class="gp-r"><i class="sw '+stCol(k)+'"></i><span>Rule '+(k+1)+" · "+esc(stRuleSum(R[k]))+(x?" <small>(after rule "+(f+1)+")</small>":"")+"</span></div>").join(""):'<div class="gp-r"><i class="sw rn"></i><span>In no rule: never given</span></div>';
 if(stVat(i).has(n))h+='<div class="gp-s occ">A pilot on VATSIM is parked here now</div>';
 if(g)h+='<div class="gp-s giv">Given to '+esc(g.cs)+" · "+(g.kind==="dep"?"STD ":"ETA ")+stZ(g.eta||g.t)+"</div>";
 if(stCan()){const out=R.map((r,k)=>k).filter(k=>!ins.includes(k));
  h+='<div class="gp-a">'+ins.map(k=>'<button type="button" data-gpout="'+k+'">Take out of rule '+(k+1)+"</button>").join("")
   +(out.length?"<span>Add to</span>"+out.map(k=>'<button type="button" data-gpin="'+k+'"><i class="sw '+stCol(k)+'"></i>Rule '+(k+1)+"</button>").join(""):"")
   +'<button type="button" data-gpnew>New rule</button></div>'}
 return h}
function stListHtml(){const i=ST.sel,m=ST.maps[i],R=stRules(),sets=stSets(),vat=stVat(i),giv=stGiven(i),onMap=m&&m.S&&m.S.length?m.S.map(s=>s.n):null;
 const chip=n=>{const k=sets.findIndex(z=>z.has(n));return '<button type="button" class="gc '+(k<0?"rn":stCol(k))+(vat.has(n)?" occ":"")+(giv.has(n)?" giv":"")+(ST.pop===n?" on":"")+'" data-sn="'+esc(n)+'"'+(vat.has(n)?' title="A pilot on VATSIM is parked here"':"")+">"+esc(n)+"</button>"};
 let h="";
 R.forEach((r,k)=>{const L=[...new Set(stExpand(r.stands).stands.map(stNorm))].filter(n=>!onMap||m.refs.has(n)).sort(stNat);
  h+='<div class="gl-g"><div class="gl-h"><i class="sw '+stCol(k)+'"></i>Rule '+(k+1)+"<small>"+esc(stRuleSum(r))+(r.term?" · "+esc(r.term):"")+'</small></div><div class="gl-c">'+(L.length?L.map(chip).join(""):'<span class="empty">'+(onMap?"None on the airport map":"No gates")+"</span>")+"</div></div>"});
 if(onMap){const none=onMap.filter(n=>!sets.some(z=>z.has(n)));if(none.length)h+='<div class="gl-g"><div class="gl-h"><i class="sw rn"></i>In no rule<small>'+none.length+' on the map</small></div><div class="gl-c">'+none.map(chip).join("")+"</div></div>"}
 if(!R.length&&!onMap)h+='<p class="empty">No rules yet.</p>';
 if(ST.pop)h+='<div class="gp gl-pop">'+stPopHtml(ST.pop)+"</div>";
 return '<div class="gl">'+h+"</div>"}
function stLegUi(){const el=$("#stLeg");if(!el)return;const R=stRules(),m=ST.maps[ST.sel],map=m&&m.S&&m.S.length;
 let h=R.slice(0,8).map((r,k)=>'<span><i class="sw '+stCol(k)+'"></i>Rule '+(k+1)+"<small>"+esc(stRuleSum(r))+"</small></span>").join("")+(R.length>8?'<span><i class="sw rx"></i>Rules 9–'+R.length+"</span>":"");
 if(map)h+='<span><i class="sw rn"></i>In no rule</span><span><i class="sw occ"></i>VATSIM aircraft on it</span><span><i class="sw giv"></i>Given to a Polaris flight</span>';
 el.innerHTML=h;
 const x=$("#stMiss");if(!x)return;if(!map){x.innerHTML="";return}const out=[],asW=[];
 R.forEach((r,k)=>{const L=stExpand(r.stands).stands,miss=L.filter(s=>!m.refs.has(stNorm(s)));if(!miss.length)return;if(miss.length===L.length)asW.push(k+1);else out.push(...miss)});
 x.innerHTML=(ST.view==="map"?"Drawn from OpenStreetMap. ":"")+(stCan()?(ST.view==="map"?"Click a stand":"Click a gate")+" to put it in a rule or take it out. ":"")
  +(out.length?'Not on the map, so never given: <span class="gt-bad">'+esc(stCompress([...new Set(out)]).replace(/-/g,"–"))+"</span>. ":"")
  +(asW.length?"No gate of rule "+asW.join(", ")+" is on the map, so "+(asW.length>1?"they are":"it is")+" given as written. ":"")}
function stViewUi(){const el=$("#stView");if(!el)return;const i=ST.sel,m=ST.maps[i],map=m&&m.S&&m.S.length;
 if(ST.view==="map"&&map){if(!$("#stGm")||$("#stGm").dataset.i!==i){el.innerHTML='<div class="gm" id="stGm" data-i="'+esc(i)+'"><svg id="stSvg" role="img" aria-label="Stands at '+esc(i)+' on the airport map, coloured by rule. The List view has the same."><g id="stBase">'+m.base+'</g><g id="stOv"></g></svg><div class="gm-z"><button type="button" data-gmz="in" aria-label="Zoom in" title="Zoom in">+</button><button type="button" data-gmz="out" aria-label="Zoom out" title="Zoom out">−</button><button type="button" data-gmz="fit" aria-label="Show all stands" title="Show all stands">⤢</button></div><div class="gp gm-pop" id="stPop" hidden></div></div><div class="gm-leg" id="stLeg"></div><p class="hint" id="stMiss"></p>'}
  stMapDraw()}
 else el.innerHTML=stListHtml()+'<div class="gm-leg" id="stLeg"></div><p class="hint" id="stMiss"></p>';
 stLegUi()}
const stMapRefresh=()=>{if(pgNow!=="gates")return;const m=ST.maps[ST.sel];if(ST.view==="map"&&m&&m.S&&m.S.length&&$("#stGm"))stMapDraw();else stViewUi();stLegUi()};

/* ---- the rules ---- */
function stGatesCell(r){const e=stExpand(r.stands),m=ST.maps[ST.sel],refs=m&&m.refs&&m.S.length?m.refs:null;
 if(e.bad.length)return '<span class="gt-bad">Cannot read: '+esc(e.bad.join(", "))+"</span>";if(!e.stands.length)return '<span class="lbl">No gates yet</span>';
 const ok=refs?e.stands.filter(s=>refs.has(stNorm(s))):e.stands,miss=refs?e.stands.filter(s=>!refs.has(stNorm(s))):[];
 const ch=(L,bad)=>L.length?stCompress(L).split(", ").map(x=>'<span class="gt-ch'+(bad?" bad":"")+'"'+(bad?' title="Not on the airport map"':"")+">"+esc(x.replace(/-/g,"–"))+"</span>").join(""):"";
 return ok.length?ch(ok)+ch(miss,true):ch(miss)}
function stEdHtml(r,k){return '<tr class="gt-er"><td></td><td colspan="5"><div class="gt-e">'
 +'<label for="stEdS">Gates</label><input type="text" id="stEdS" class="sr" data-str="'+k+'" data-f="stands" value="'+esc(r.stands)+'" placeholder="C1-C10, D5, 201-215" spellcheck="false" autocomplete="off"><div class="st-x" id="stX"></div>'
 +'<div class="gt-e3"><div><label>Flights</label><select data-str="'+k+'" data-f="fl">'+Object.entries(ST_FL).map(([v,t])=>'<option value="'+v+'"'+((r.fl||"all")===v?" selected":"")+">"+t+"</option>").join("")+"</select></div>"
 +'<div><label>Aircraft</label><select data-str="'+k+'" data-f="ac" title="Normal: the A320 family. Heavy: A330, A350, 777, 787 and other widebodies">'+[["narrow","Normal (A320 family)"],["wide","Heavy (widebodies)"],["all","Any size"]].map(([v,t])=>'<option value="'+v+'"'+((r.ac||"all")===v?" selected":"")+">"+t+"</option>").join("")+"</select></div>"
 +'<div><label>Terminal</label><input type="text" class="tm" data-str="'+k+'" data-f="term" value="'+esc(r.term||"")+'" placeholder="T1" maxlength="20" autocomplete="off"></div></div>'
 +'<div class="actions"><button type="button" class="primary" data-sted="-1">Done</button>'+(k?'<button type="button" data-stup="'+k+'">Try before rule '+k+"</button>":"")+'<button type="button" class="warn" data-strm="'+k+'">Remove rule</button></div></div></td></tr>'}
function stXUi(){const x=$("#stX"),R=stRules();if(!x||ST.ed<0||!R[ST.ed])return;const e=stExpand(R[ST.ed].stands);
 x.className="st-x"+(e.bad.length?" bad":"");x.textContent=e.bad.length?"Cannot read: "+e.bad.join(", ")+" (write gates like D1-D10, C5)":e.stands.length?e.stands.length+(e.stands.length===1?" gate: ":" gates: ")+e.stands.slice(0,16).join(", ")+(e.stands.length>16?" …":""):"Write the gates, or click stands on the map"}
function stRulesUi(){const el=$("#stRules");if(!el)return;const i=ST.sel,R=stRules();
 let h=R.length?'<div class="gt-tw"><table class="gt-t gt-r"><thead><tr><th>#</th><th>Gates</th><th>Flights</th><th>Aircraft</th><th>Terminal</th><th></th></tr></thead><tbody>'
  +R.map((r,k)=>'<tr data-k="'+k+'"><td><i class="sw '+stCol(k)+'"></i> '+(k+1)+'</td><td class="gc-cell">'+stGatesCell(r)+"</td><td>"+ST_FL[r.fl||"all"]+"</td><td>"+ST_AC[r.ac||"all"]+'</td><td class="tm-cell">'+esc(r.term||"")+'</td><td class="r">'+(stCan()?'<button type="button" class="lnk" data-sted="'+(ST.ed===k?-1:k)+'">'+(ST.ed===k?"Close":"Edit")+"</button>":"")+"</td></tr>"+(ST.ed===k&&stCan()?stEdHtml(r,k):"")).join("")+"</tbody></table></div>"
  :'<p class="hint gt-none">No rules at '+esc(i)+" yet, so no gate is given here."+(stCan()?" Add a rule, or click a stand on the map.":"")+"</p>";
 if(R.length&&R.every(r=>!r.ac||r.ac==="all"))h+='<div class="st-warn">Every rule here is Any size, so a heavy (A330, A350…) can be given an A320 gate. Set the A320 gates to <b>Normal</b> and the big ones to <b>Heavy</b>.</div>';
 h+='<div class="gt-act"><button type="button" data-st="addr">Add rule</button><span class="sp"></span><span class="gt-dirty"'+(ST.dirty?"":" hidden")+'>Not saved</span><button type="button" data-st="discard"'+(ST.dirty?"":" disabled")+'>Discard</button><button type="button" class="primary" id="stSave"'+(ST.dirty?"":" disabled")+">Save</button></div>";
 el.innerHTML=h;stXUi()}
function stActUi(){const d=$(".gt-dirty"),a=$('[data-st="discard"]'),s=$("#stSave");if(d)d.hidden=!ST.dirty;if(a)a.disabled=!ST.dirty;if(s)s.disabled=!ST.dirty}
function stMainUi(){const el=$("#stMain");if(!el)return;const i=ST.sel;if(!i){el.innerHTML='<p class="empty">Pick an airport.</p>';return}
 const m=ST.maps[i],map=m&&m.S&&m.S.length,nm=stAptName(i);
 el.innerHTML='<div class="gt-h"><div class="pg-h"><h2>'+esc(i)+(nm?" · "+esc(nm):"")+'</h2><details class="help"><summary aria-label="How the gates are given">?</summary><div><p>Rules are tried from the top: the first gate of the first rule that fits the flight and is free is given. A flight is <b>domestic</b> when both airports are in the same country (the US with Hawaii and Alaska); otherwise <b>international</b>.</p><p>A gate is taken while a pilot on VATSIM is parked on it, or while another Polaris arrival or departure has it within 45 minutes. Write gates as ranges, like <b>C1-C10, D5, 201-215</b>. Gates the airport map does not show are not given, so a range may cover numbers that do not exist.</p><p><b>Normal</b> gates take the A320 family; <b>Heavy</b> gates take widebodies and any flight plan with wake category H. A heavy is never given a Normal gate. Put <b>Any size</b> rules after the Normal ones, so A320s fill their own gates first. If every gate is taken, the crew get “GATE: CONTACT GROUND”.</p></div></details></div>'
  +'<div class="kf" role="group" aria-label="Show"><button type="button" data-stmv="map" aria-pressed="'+(ST.view==="map"&&!!map)+'"'+(map?"":" disabled")+'>Map</button><button type="button" data-stmv="list" aria-pressed="'+(ST.view==="list"||!map)+'">List</button></div></div>'
  +(m&&m.loading?'<div class="gm-wait">Reading the '+esc(i)+" airport map…</div>":m&&(m.err||m.none)?'<p class="hint gm-note">'+esc(m.err||"OpenStreetMap has no map of "+i+", so the gates are shown from the rules alone.")+"</p>":m&&m.S&&!m.S.length?'<p class="hint gm-note">The '+esc(i)+" airport map has no numbered stands, so the gates are shown from the rules alone.</p>":"")
  +'<div id="stView"></div><div id="stRules"></div><div id="stMsg"></div>'
  +'<div class="gt-try"><span class="l">Try it</span><select id="stTryAc" aria-label="Aircraft"><option value="narrow"'+(ST.tryAc==="narrow"?" selected":"")+'>Normal (A320 family)</option><option value="wide"'+(ST.tryAc==="wide"?" selected":"")+'>Heavy (widebody)</option></select><select id="stTryFl" aria-label="Flight"><option value="dom"'+(ST.tryFl==="dom"?" selected":"")+'>Domestic</option><option value="intl"'+(ST.tryFl==="intl"?" selected":"")+'>International</option></select><span id="stTryR"></span></div>';
 if(!(m&&m.loading))stViewUi();stRulesUi();stTry()}
/* the gates a flight would have got before the one given, but which are taken now (as the server reckons it) */
function stTakenBefore(res){const i=ST.sel,m=ST.maps[i],refs=m&&m.refs&&m.S.length?m.refs:null,H=ST.tryAc==="wide",fl=ST.tryFl,at=Date.now()+30*6e4,vat=stVat(i),want=stNorm(res.stand);
 const pol=new Set(ST.log.filter(x=>x.stand&&(x.kind==="dep"?x.dep:x.arr)===i&&Math.abs((x.eta||x.t)-at)<45*6e4).map(x=>stNorm(x.stand))),out=[];
 for(const r of stRules()){if(!(r.ac==="all"||!r.ac||(r.ac==="wide")===H))continue;if(r.fl&&r.fl!=="all"&&r.fl!==fl)continue;let L=stExpand(r.stands).stands;if(refs&&L.some(x=>refs.has(stNorm(x))))L=L.filter(x=>refs.has(stNorm(x)));
  for(const s of L){const n=stNorm(s);if(n===want)return out;if(vat.has(n)||pol.has(n))out.push(s)}}return out}
let stTryT=0;function stTry(){clearTimeout(stTryT);const i=ST.sel,el=$("#stTryR");if(!el||!i)return;if(!stRules().length){el.innerHTML='<span class="lbl">→ no rules, so no gate</span>';if(ST.tryRes){ST.tryRes=null;stMapRefresh()}return}
 stTryT=setTimeout(async()=>{const q=ST.tq=(ST.tq||0)+1;try{const r=await api("/admin/api/stands/try",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apts:ST.plan.apts,icao:i,fl:ST.tryFl,wide:ST.tryAc==="wide"})});if(q!==ST.tq||ST.sel!==i)return;
  ST.tryRes=r;const t=$("#stTryR");if(!t)return;
  if(r.stand){const tb=stTakenBefore(r);t.innerHTML="→ gets <b>"+esc(r.stand)+"</b>"+(r.term?" · "+esc(r.term):"")+(tb.length?' <span class="lbl">('+esc(tb.slice(0,6).join(", "))+(tb.length>6?" …":"")+" taken)</span>":"")+(ST.view==="map"?' <span class="lbl">· ringed on the map</span>':"")}
  else t.innerHTML=r.none==="full"?'→ <span class="gt-cg">every gate is taken</span> <span class="lbl">(the crew are told to contact ground)</span>':'→ <span class="lbl">no rule fits this flight, so no gate</span>';
  stMapRefresh()}catch(e){if(q!==ST.tq)return;const t=$("#stTryR");if(t)t.innerHTML='<span class="gt-bad">'+esc(e.message)+"</span>"}},350)}

/* ---- the gates sent ---- */
/* a gate's "Change" row: the new gate and terminal being written (v), drawn under its flight's row */
function stChgRow(tr,k,v){tr.insertAdjacentHTML("afterend",'<tr class="gt-chg"><td colspan="7"><div class="chg"><input type="text" maxlength="8" placeholder="New gate" autocomplete="off" spellcheck="false"><input type="text" maxlength="20" placeholder="Terminal" autocomplete="off"><button type="button" class="primary" data-stsend="'+esc(k)+'"'+(ST.chgBusy.has(k)?" disabled":"")+'>Send GATE CHANGE</button><button type="button" data-stchgx>Cancel</button></div></td></tr>');
 const r=tr.nextElementSibling,I=r.querySelectorAll("input");(v||[]).forEach((x,i)=>{if(I[i])I[i].value=x});return r}
/* the change rows open now, with what is typed in them and which field has the focus (the cursor too) */
function stChgOpen(el){return Array.from(el.querySelectorAll(".gt-chg")).map(r=>{const b=r.querySelector("[data-stsend]"),I=Array.from(r.querySelectorAll("input")),a=document.activeElement,f=I.indexOf(a);
 return b?{k:b.dataset.stsend,v:I.map(x=>x.value),f,s:f>=0?[a.selectionStart,a.selectionEnd]:null}:null}).filter(Boolean)}
/* the gates sent, drawn again (the 2-minute reload too): a change row being written stays open as it was; a reload
   that fails says so above the list it had */
function stLogUi(){const el=$("#stLog");if(!el)return;const keep=stChgOpen(el),err=ST.err?'<div class="msg err">'+esc(ST.err)+"</div>":"";
 if(ST.err&&!ST.log.length){el.innerHTML=err;return}
 const all=ST.logAll||!ST.sel,i=ST.sel,L=ST.log.filter(x=>all||(x.kind==="dep"?x.dep===i:x.arr===i)).slice().sort((a,b)=>(b.eta||b.t)-(a.eta||a.t));
 document.querySelectorAll("[data-stv]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.stv===(all?"all":"apt"))));const ab=$('[data-stv="apt"]');if(ab)ab.textContent=i||"This airport";
 el.innerHTML=err+(L.length?'<div class="gt-tw"><table class="gt-t gt-lt"><thead><tr><th>Flight</th><th>Route</th><th>Gate</th><th>Time</th><th>Sent</th><th>By</th><th></th></tr></thead><tbody>'+L.map(x=>{const dep=x.kind==="dep",key=esc(x.k)+"|"+x.t;
  return '<tr><td><span class="k2">'+(dep?"DEP":"ARR")+'</span><b class="mono">'+esc(x.cs)+"</b></td><td>"+esc((x.dep||"----")+" → "+(x.arr||"----"))+'</td><td class="mono">'+(x.stand?esc(x.stand)+(x.term?" · T"+esc(String(x.term).replace(/^T(ERMINAL)? */,"")):""):'<span class="gt-cg">'+(dep?"ANY FREE GATE":"CONTACT GROUND")+"</span>")
   +'</td><td class="mono">'+(dep?"STD ":"ETA ")+stZ(x.eta)+'</td><td class="mono">'+stZ(x.changed||x.t)+(x.changed?' <small class="lbl">changed</small>':"")+'</td><td class="lbl">'+(x.by==="AUTO"?"Automatic":esc(String(x.by).split("@")[0]))+'</td><td class="r"><button type="button" class="lnk" data-stchg="'+key+'">Change</button></td></tr>'}).join("")+"</tbody></table></div>"
  :'<p class="empty">'+(all?"Nothing sent in the last two days.":"No gate sent at "+esc(i)+" in the last two days.")+"</p>");
 for(const x of keep){const b=Array.from(el.querySelectorAll("[data-stchg]")).find(y=>y.dataset.stchg===x.k);if(!b)continue;
  const r=stChgRow(b.closest("tr"),x.k,x.v);if(x.f>=0){const I=r.querySelectorAll("input")[x.f];if(I){I.focus();if(x.s)try{I.setSelectionRange(x.s[0],x.s[1])}catch(e){}}}}}
/* full: the page opened (draw it all); otherwise only what may have moved (a rule being written stays as it is) */
/* (P2) ST.lq: the latest load, or a save; an answer from before either is dropped, so the plan just saved never goes back */
async function stLoad(full){if(!["gates","auto","fw"].some(pgHas))return;const q=ST.lq=(ST.lq||0)+1;ST.err="";
 try{const j=await api("/admin/api/stands");if(q!==ST.lq)return;ST.log=j.log||[];ST.apts=j.apts||{};ST.saved=stClone(j.plan);OPS.stands={at:Date.now(),v:j,p:null,err:""};if(!ST.dirty||!ST.plan)ST.plan=stClone(j.plan);
  stStateUi();if(pgNow==="auto")auUi();
  if(!ST.sel){const k=Object.keys(ST.plan.apts).sort();ST.sel=k[0]||Object.keys(ST.apts)[0]||""}
  if(pgNow==="gates"){if(full||!ST.ready){ST.ready=true;stAptsUi();stMainUi();stMap(ST.sel);stBusy(ST.sel)}else{stAptsUi();stMapRefresh()}}}
 catch(e){if(q!==ST.lq)return;ST.err=e.message}if(pgNow==="gates")stLogUi()}
const stDirty=()=>{ST.dirty=true;stSay("");stActUi()};
function stChanged(){stDirty();stAptsUi();stMapRefresh();stTry()}
document.addEventListener("input",e=>{const t=e.target;if(!t.closest||!t.closest("#stands"))return;
 if(t.id==="stFind"){ST.q=t.value;stAptsUi();return}
 if(t.dataset.str!=null){const r=stRules()[+t.dataset.str];if(!r)return;r[t.dataset.f]=t.value;
  const row=document.querySelector('#stRules tr[data-k="'+t.dataset.str+'"]');if(row){if(t.dataset.f==="stands")row.querySelector(".gc-cell").innerHTML=stGatesCell(r);if(t.dataset.f==="term")row.querySelector(".tm-cell").textContent=t.value.toUpperCase()}
  stXUi();stChanged()}});
document.addEventListener("change",e=>{const t=e.target;if(!t.closest||!t.closest("#stands"))return;
 if(t.tagName==="SELECT"&&t.dataset.str!=null){const r=stRules()[+t.dataset.str];if(r){r[t.dataset.f]=t.value;stRulesUi();stChanged()}return}
 if(t.id==="stTryAc"){ST.tryAc=t.value;stTry();return}if(t.id==="stTryFl"){ST.tryFl=t.value;stTry()}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&ST.pop&&pgNow==="gates"&&!(e.target&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName||""))){ST.pop="";stMapRefresh();return}
 if(e.key==="Enter"&&e.target.id==="stFind"){const b=document.querySelector("#stApts [data-staadd],#stApts [data-sta]");if(b){e.preventDefault();b.click()}}});
/* the map: drag to move, the wheel or two fingers to zoom, a click on a stand for what it is */
document.addEventListener("pointerdown",e=>{const svg=e.target.closest&&e.target.closest("#stSvg");if(!svg||!ST.M)return;GM.p.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(GM.p.size===1){GM.down={x:e.clientX,y:e.clientY,tx:ST.M.tx,ty:ST.M.ty,t:e.target};GM.moved=false}
 else if(GM.p.size===2){const [a,b]=[...GM.p.values()];GM.pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,k:ST.M.k};GM.moved=true}
 try{svg.setPointerCapture(e.pointerId)}catch(x){}});
document.addEventListener("pointermove",e=>{if(!GM.p.has(e.pointerId)||!ST.M)return;GM.p.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(GM.p.size>=2&&GM.pinch){const [a,b]=[...GM.p.values()],svg=$("#stSvg");if(!svg)return;const r=svg.getBoundingClientRect();stZoomTo(GM.pinch.k*Math.hypot(a.x-b.x,a.y-b.y)/GM.pinch.d,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);return}
 const D=GM.down;if(!D)return;const dx=e.clientX-D.x,dy=e.clientY-D.y;if(!GM.moved&&Math.hypot(dx,dy)<5)return;GM.moved=true;ST.M.tx=D.tx+dx;ST.M.ty=D.ty+dy;gmMove()});
document.addEventListener("pointerup",e=>{if(!GM.p.has(e.pointerId))return;GM.p.delete(e.pointerId);if(GM.p.size<2)GM.pinch=null;
 if(!GM.p.size){const D=GM.down;GM.down=null;if(D&&!GM.moved&&ST.M){const g=D.t.closest&&D.t.closest("[data-sn]");ST.pop=g?(ST.pop===g.dataset.sn?"":g.dataset.sn):"";stMapDraw()}
  else if(D&&GM.moved&&ST.M){clearTimeout(GM.settle);GM.settle=0;stMapDraw()}}
 else if(ST.M){const [a]=[...GM.p.values()];GM.down={x:a.x,y:a.y,tx:ST.M.tx,ty:ST.M.ty,t:e.target};GM.moved=true}});
document.addEventListener("pointercancel",e=>{GM.p.delete(e.pointerId);if(!GM.p.size){const D=GM.down;GM.down=null;GM.pinch=null;if(D&&GM.moved&&ST.M)stMapDraw()}});
document.addEventListener("wheel",e=>{const svg=e.target.closest&&e.target.closest("#stSvg");if(!svg||!ST.M)return;e.preventDefault();const r=svg.getBoundingClientRect();stZoomTo(ST.M.k*Math.exp(-e.deltaY*(e.deltaMode?.05:.0015)),e.clientX-r.left,e.clientY-r.top)},{passive:false});
window.addEventListener("resize",()=>{if(pgNow==="gates"&&$("#stGm"))gmDraw()});
document.addEventListener("click",async e=>{const b=e.target.closest&&e.target.closest("#stands button");if(!b||!ST.plan)return;const P=ST.plan.apts,R=stRules(),d=b.dataset;
 if(d.sta){stPick(d.sta);return}
 if(d.staadd){const i=d.staadd;if(!P[i])P[i]=[];ST.q="";$("#stFind").value="";stPick(i);return}
 if(d.stmv){ST.view=d.stmv;ST.pop="";document.querySelectorAll("[data-stmv]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.stmv===ST.view)));stViewUi();return}
 if(d.gmz){const M=ST.M;if(!M)return;if(d.gmz==="fit"){ST.M=null;stMapDraw()}else stZoomTo(M.k*(d.gmz==="in"?1.6:1/1.6),M.W/2,M.H/2);return}
 if(d.sn!=null){ST.pop=ST.pop===d.sn?"":d.sn;stViewUi();return}
 if(d.gpx!=null){ST.pop="";stMapRefresh();return}
 if(d.gpout!=null){const r=R[+d.gpout];if(!r)return;r.stands=stCompress(stExpand(r.stands).stands.filter(x=>stNorm(x)!==ST.pop));stRulesUi();stChanged();return}
 if(d.gpin!=null){const r=R[+d.gpin];if(!r)return;r.stands=stCompress([...stExpand(r.stands).stands,ST.pop]);stRulesUi();stChanged();return}
 if(d.gpnew!=null){(P[ST.sel]=P[ST.sel]||[]).push({stands:ST.pop,fl:"all",ac:"narrow",term:""});ST.ed=P[ST.sel].length-1;stRulesUi();stChanged();return}
 if(d.sted!=null){ST.ed=+d.sted;stRulesUi();const s=$("#stEdS");if(s&&ST.ed>=0){s.focus();s.setSelectionRange(s.value.length,s.value.length)}return}
 if(d.st==="addr"){(P[ST.sel]=P[ST.sel]||[]).push({stands:"",fl:"all",ac:"narrow",term:""});ST.ed=P[ST.sel].length-1;stRulesUi();stChanged();const s=$("#stEdS");if(s)s.focus();return}
 if(d.st==="discard"){if(!confirm("Discard the changes to the gate plan?"))return;ST.plan=stClone(ST.saved);ST.dirty=false;ST.ed=-1;stSay("");stAptsUi();stMainUi();return}
 if(d.strm!=null){const k=+d.strm;if(R[k]&&R[k].stands&&!confirm("Remove rule "+(k+1)+" at "+ST.sel+"?"))return;R.splice(k,1);ST.ed=-1;stRulesUi();stChanged();return}
 if(d.stup!=null){const k=+d.stup;[R[k-1],R[k]]=[R[k],R[k-1]];ST.ed=k-1;stRulesUi();stChanged();return}
 if(b.id==="stSave"){b.disabled=true;ST.lq=(ST.lq||0)+1;try{const j=await api("/admin/api/stands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(stBody())});ST.lq++;
   ST.saved=stClone(j.plan);ST.plan=stClone(j.plan);ST.dirty=false;ST.ed=-1;opsDrop("stands");stStateUi();stAptsUi();stRulesUi();stMapRefresh();stTry();
   stSay("Saved. "+(j.plan.on||j.plan.dep?"Gates are given from this plan from now on.":"The gate messages are off, so nothing is sent until they are turned on in Automatic messages."),true)}
  catch(er){b.disabled=false;
   /* someone else saved the gates meanwhile: nothing was overwritten. The edits stay on the page; theirs are what
      Discard brings back, and Save again (now knowingly over theirs) replaces them */
   if(er.status===409&&er.data&&er.data.plan){const P2=er.data.plan;ST.saved=stClone(P2);ST.plan.aptsAt=stAt(P2,"apts");opsDrop("stands");stStateUi();
    stSay((P2.by?String(P2.by).split("@")[0]:"Someone else")+" saved the gate plan at "+stZ(stAt(P2,"apts"))+" while you were editing, so yours was not saved. Discard to see theirs, or Save again to replace theirs with yours.")}
   else stSay(er.message)}return}
 if(d.stv){ST.logAll=d.stv==="all";stLogUi();return}
 if(b.id==="stReload"){stLoad();stBusy(ST.sel,true);return}
 if(d.stchg){const tr=b.closest("tr");if(tr.nextElementSibling&&tr.nextElementSibling.classList.contains("gt-chg"))return;stChgRow(tr,d.stchg).querySelector("input").focus();return}
 if(d.stchgx!=null){b.closest("tr").remove();return}
 if(d.stsend){const key=d.stsend,[k,t]=key.split("|"),I=b.parentElement.querySelectorAll("input"),stand=I[0].value.trim();if(!stand){I[0].focus();return}if(ST.chgBusy.has(key))return;
  /* the row may be drawn again while this is on its way (the reload): the one there now is the one to change */
  const cur=()=>Array.from(document.querySelectorAll("#stLog [data-stsend]")).find(y=>y.dataset.stsend===key);
  ST.chgBusy.add(key);b.disabled=true;
  try{await api("/admin/api/stands/change",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({k,t:+t,stand,term:I[1].value.trim()||undefined})});
   ST.chgBusy.delete(key);const x=cur();if(x)x.closest("tr").remove();await stLoad()}
  catch(er){ST.chgBusy.delete(key);const x=cur();if(x)x.disabled=false;alert(er.message)}return}});
window.addEventListener("beforeunload",e=>{if(ST.dirty){e.preventDefault();e.returnValue=""}});
PG_LOAD.gates=()=>stLoad(true);PG_TICK.gates=[()=>{stLoad();if(ST.sel)stBusy(ST.sel,true)},120000];
/* ---------- Messages › From names and AOC templates (was Settings › Composer) ---------- */
const SE={tpl:null,dirty:false};
const seSay=(id,t,ok)=>{const m=$(id);if(m)m.innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
function setTplUi(){const el=$("#setTpl");if(!el)return;if(!SE.tpl){el.innerHTML='<span class="empty">Loading…</span>';return}
 el.innerHTML=SE.tpl.length?SE.tpl.map((t,i)=>'<div class="set-t"><input type="text" data-sett="'+i+'" data-f="title" value="'+esc(t.title)+'" maxlength="40" placeholder="TITLE" spellcheck="false" aria-label="Title"><span class="b">'+(i?'<button type="button" data-setup="'+i+'" title="Move up" aria-label="Move up">↑</button>':"")+'<button type="button" data-setrm="'+i+'" title="Remove" aria-label="Remove">✕</button></span><textarea data-sett="'+i+'" data-f="body" maxlength="2000" placeholder="{CS} {DEP}-{ARR} … (empty: staff write it all)" spellcheck="false" aria-label="Message">'+esc(t.body)+"</textarea></div>").join(""):'<p class="hint" style="margin:0">No templates.</p>'}
async function setLoad(){try{const j=await opsGet("set",0);setApply(j.settings);if(!SE.dirty){SE.tpl=j.settings.tpl.map(t=>({...t}));$("#setFroms").value=j.settings.froms.join("\\n")}seSay("#setMsg","")}
 catch(e){seSay("#setMsg",e.message)}setTplUi()}
document.addEventListener("input",e=>{const t=e.target;if(!t.closest||!t.closest("#cmSet"))return;
 if(t.dataset.sett!=null){SE.tpl[+t.dataset.sett][t.dataset.f]=t.value;SE.dirty=true;seSay("#setMsg","");return}
 if(t.id==="setFroms"){SE.dirty=true;seSay("#setMsg","")}});
document.addEventListener("click",async e=>{const b=e.target.closest&&e.target.closest("#cmSet button");if(!b)return;
 if(b.id==="setTplAdd"){SE.tpl=SE.tpl||[];SE.tpl.push({title:"",body:""});SE.dirty=true;setTplUi();const L=document.querySelectorAll("#setTpl input");if(L.length)L[L.length-1].focus();return}
 if(b.dataset.setrm!=null){SE.tpl.splice(+b.dataset.setrm,1);SE.dirty=true;setTplUi();return}
 if(b.dataset.setup!=null){const k=+b.dataset.setup;[SE.tpl[k-1],SE.tpl[k]]=[SE.tpl[k],SE.tpl[k-1]];SE.dirty=true;setTplUi();return}
 if(b.id==="setSave"){const froms=$("#setFroms").value.split("\\n").map(s=>s.trim()).filter(Boolean),tpl=(SE.tpl||[]).filter(t=>t.title.trim());
  if(!froms.length){seSay("#setMsg","Keep at least one From name.");return}
  b.disabled=true;try{const j=await api("/admin/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({froms,tpl})});
   OPS.set={at:Date.now(),v:{settings:j.settings},p:null,err:""};SE.dirty=false;SE.tpl=j.settings.tpl.map(t=>({...t}));$("#setFroms").value=j.settings.froms.join("\\n");setTplUi();setApply(j.settings);seSay("#setMsg","Saved. The composers use these now.",true)}
  catch(er){seSay("#setMsg",er.message)}finally{b.disabled=false}}});
window.addEventListener("beforeunload",e=>{if(SE.dirty){e.preventDefault();e.returnValue=""}});
/* ---------- Settings: People and Roles (Nov 2026) ----------
   Which pages a role sees (no-p-*) and what it may change (no-a-*): classes on the page that hide what is not
   theirs. The server checks every change as well. Only administrators see Settings. */
const RL={on:false,people:[],roles:[],me:"",busy:false,ed:null,chg:"",mail:null};
const rlName=id=>{const r=RL.roles.find(x=>x.id===id);return r?r.name:id};
async function rlLoad(){if(PERM&&!PERM.can.has("roles"))return;try{rlSetData(await api("/admin/api/roles"))}catch(e){seSay("#rlMsg",e.message)}rlUi()}
function rlSetData(j){RL.on=!!j.on;RL.people=j.people||[];RL.roles=j.roles||[];RL.me=j.me||RL.me;RL.mail=j.mail||RL.mail}
function rlOpts(sel){return RL.roles.map(r=>'<option value="'+esc(r.id)+'"'+(r.id===sel?" selected":"")+">"+esc(r.name)+"</option>").join("")}
function rlSees(r){if(r.builtin)return"Everything";const pg=RL_PAGES.filter(x=>r.pages.includes(x[0])).map(x=>x[1]);return pg.length===RL_PAGES.length?"Every page":pg.length?pg.join(", "):"Home and Tasks only"}
function rlCan(r){if(r.builtin)return"Everything, and these roles";const can=RL_ACTS.filter(x=>r.can.includes(x[0])).map(x=>x[1]);return can.length?can.map((x,i)=>i?x.toLowerCase():x).join(", "):"Changes nothing"}
function rlSeen(t){if(!t)return"—";const d=new Date(t),day=x=>x.toISOString().slice(0,10),now=new Date(),y=new Date(Date.now()-864e5),n=Math.floor((Date.now()-t)/864e5);
 return day(d)===day(now)?"Today "+stZ(t):day(d)===day(y)?"Yesterday":n<7?n+" days ago":d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:d.getUTCFullYear()===now.getUTCFullYear()?undefined:"numeric",timeZone:"UTC"})}
function rlUi(){const el=$("#rlList");if(!el)return;
 const ml=$("#rlMail");if(ml&&RL.mail)ml.innerHTML=RL.mail.ready?'<span class="bdg on">Email on</span><span>from '+esc(RL.mail.from)+"</span>":'<span class="bdg bad">Email not set up</span><a class="lk" href="https://github.com/KOZ8738/home/blob/main/workers/polaris-efb-api/README.md" target="_blank" rel="noopener">How to set it up ›</a>';
 $("#rlNote").textContent=RL.on?"Anyone who signs in through Cloudflare Access without a role here is turned away.":"Roles are off: everyone who can sign in is an administrator. Adding someone turns them on, and you are added as an administrator first.";
 $("#rlCount").textContent=RL.people.length?RL.people.length+(RL.people.length===1?" person":" people"):"";
 el.innerHTML=RL.people.length?'<div class="gt-tw"><table class="gt-t rl-t"><thead><tr><th>Email</th><th>Role</th><th>Pilot ID</th><th>Last signed in</th><th></th></tr></thead><tbody>'+RL.people.map(p=>{const ch=RL.chg===p.email;
  return "<tr><td><b>"+esc(p.email)+"</b>"+(p.email===RL.me?'<small class="rl-you">You</small>':"")+"</td><td>"+(ch?'<select data-rlset="'+esc(p.email)+'" aria-label="Role">'+rlOpts(p.role)+"</select>":'<span class="bdg '+(p.role==="admin"?"adm":"role")+'">'+esc(rlName(p.role))+"</span>")
   +"</td><td>"+(ch?'<input type="text" class="rl-pid" data-rlpid="'+esc(p.email)+'" data-role="'+esc(p.role)+'" value="'+esc(p.pilot||"")+'" placeholder="PAW0006" maxlength="10" autocomplete="off" spellcheck="false" aria-label="Pilot ID">':p.pilot?'<span class="mono">'+esc(p.pilot)+"</span>":'<span class="lbl">—</span>')
   +'</td><td class="lbl"'+(p.seen?' title="'+esc(fmt(p.seen))+'"':"")+">"+rlSeen(p.seen)+'</td><td class="r">'+(ch?'<button type="button" class="lnk warn" data-rlrm="'+esc(p.email)+'">Remove</button><button type="button" class="lnk" data-rlchg="">Done</button>':'<button type="button" class="lnk" data-rlchg="'+esc(p.email)+'">Change</button>')+"</td></tr>"}).join("")+"</tbody></table></div>":'<p class="empty">No one yet.</p>';
 const ar=$("#rlRole"),keep=ar.value;ar.innerHTML=rlOpts(keep||(RL.roles.find(r=>!r.builtin)||{id:"admin"}).id);
 $("#rlRoles").innerHTML='<div class="gt-tw"><table class="gt-t rl-t rl-rt"><thead><tr><th>Role</th><th>People</th><th>Sees</th><th>Can</th><th></th></tr></thead><tbody>'+RL.roles.map(r=>"<tr><td><b>"+esc(r.name)+"</b></td><td>"+(r.n||'<span class="lbl">—</span>')+'</td><td class="lbl">'+esc(rlSees(r))+'</td><td class="lbl">'+esc(rlCan(r))+'</td><td class="r">'+(r.builtin?"":'<button type="button" class="lnk" data-rled="'+esc(r.id)+'">Edit</button>')+"</td></tr>").join("")+"</tbody></table></div>";
 const E=RL.ed,box=$("#rlEd");box.hidden=!E;$("#rlNew").hidden=!!E;if(!E){box.innerHTML="";return}
 const cur=RL.roles.find(r=>r.id===E.id);
 box.innerHTML='<label class="n" for="rlEdName">'+(E.id?"Role":"New role")+'</label><input type="text" id="rlEdName" maxlength="40" placeholder="Dispatcher" value="'+esc(E.name)+'" autocomplete="off">'
  +'<div class="rl-h">Pages they see</div><p class="rl-note">Their Home shows only what is on these pages, and the server keeps the other pages’ data from them.</p><div class="rl-g"><label class="rl-c"><input type="checkbox" checked disabled><span>Home and Tasks</span></label>'+RL_PAGES.map(x=>'<label class="rl-c"><input type="checkbox" data-rlpg="'+x[0]+'"'+(E.pages.has(x[0])?" checked":"")+"><span>"+esc(x[1])+"</span></label>").join("")+"</div>"
  +'<div class="rl-h">What they can change</div><div class="rl-g acts">'+RL_ACTS.map(x=>'<label class="rl-c"><input type="checkbox" data-rlact="'+x[0]+'"'+(E.can.has(x[0])?" checked":"")+"><span>"+esc(x[1])+(x[2]?"<small>"+esc(x[2])+"</small>":"")+"</span></label>").join("")+"</div>"
  +'<div class="actions"><button class="primary" type="button" id="rlEdSave">'+(E.id?"Save":"Make role")+'</button><button type="button" id="rlEdCancel">Cancel</button>'+(E.id?'<button type="button" class="warn" id="rlEdDel"'+(cur&&cur.n?' title="Give its people another role first"':"")+">Delete role</button>":"")+"</div>"}
async function rlPost(body,el,ok){if(RL.busy){rlUi();seSay(body.op?"#rlRMsg":"#rlMsg","Wait a moment: the change before this one is still being saved. Then make this one again.");return false}RL.busy=true;if(el)el.disabled=true;
 try{const j=await api("/admin/api/roles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});rlSetData(j);
  if(ok)ok();meLoad();return true}
 catch(e){seSay(body.op?"#rlRMsg":"#rlMsg",e.message);return false}finally{RL.busy=false;if(el)el.disabled=false;rlUi()}}
document.addEventListener("click",async e=>{const b=e.target.closest("#rlAdd,[data-rlrm],[data-rlchg],#rlNew,[data-rled],#rlEdSave,#rlEdCancel,#rlEdDel");if(!b)return;
 if(b.id==="rlAdd"){const em=$("#rlEmail").value.trim().toLowerCase(),r=$("#rlRole").value,pid=$("#rlPilot").value.trim();if(!em){seSay("#rlMsg","Write the email they sign in with");return}
  if(await rlPost({email:em,role:r,...(pid?{pilot:pid}:{})},b,()=>seSay("#rlMsg",em+" is now "+rlName(r)+".",true))){$("#rlEmail").value="";$("#rlPilot").value=""}return}
 if(b.dataset.rlchg!=null){RL.chg=b.dataset.rlchg;seSay("#rlMsg","");rlUi();return}
 if(b.dataset.rlrm!=null){const em=b.dataset.rlrm;if(!confirm("Take away the role of "+em+"? They will not be able to open this admin."))return;RL.chg="";rlPost({email:em,role:null},b,()=>seSay("#rlMsg",em+" no longer has a role.",true));return}
 if(b.id==="rlNew"){RL.ed={id:"",name:"",pages:new Set(["fw"]),can:new Set()};seSay("#rlRMsg","");rlUi();$("#rlEdName").focus();return}
 if(b.dataset.rled!=null){const r=RL.roles.find(x=>x.id===b.dataset.rled);if(!r)return;RL.ed={id:r.id,name:r.name,pages:new Set(r.pages.filter(p=>p!=="home"&&p!=="tasks")),can:new Set(r.can)};seSay("#rlRMsg","");rlUi();$("#rlEd").scrollIntoView({block:"nearest",behavior:"smooth"});return}
 if(b.id==="rlEdCancel"){RL.ed=null;rlUi();return}
 const E=RL.ed;if(!E)return;
 if(b.id==="rlEdSave"){const name=$("#rlEdName").value.trim();if(!name){seSay("#rlRMsg","Give the role a name");return}
  rlPost({op:"role",id:E.id||undefined,name,pages:[...E.pages],can:[...E.can]},b,()=>{seSay("#rlRMsg",(E.id?"Saved ":"Made ")+name+".",true);RL.ed=null});return}
 if(b.id==="rlEdDel"){if(!confirm("Delete the role "+E.name+"?"))return;rlPost({op:"delrole",id:E.id},b,()=>{seSay("#rlRMsg","Deleted "+E.name+".",true);RL.ed=null})}});
document.addEventListener("change",e=>{const t=e.target;if(!t.dataset)return;
 if(t.dataset.rlpid!=null){const em=t.dataset.rlpid,v=t.value.trim().toUpperCase();rlPost({email:em,role:t.dataset.role,pilot:v},t,()=>seSay("#rlMsg",v?em+" is linked to pilot "+v+": their tasks show in that pilot's EFB Calendar.":em+" is no longer linked to a pilot.",true));return}
 if(t.dataset.rlset!=null){const em=t.dataset.rlset,r=t.value;rlPost({email:em,role:r},t,()=>{RL.chg="";seSay("#rlMsg",em+" is now "+rlName(r)+".",true)});return}
 const E=RL.ed;if(!E)return;
 if(t.dataset.rlpg!=null){if(t.checked)E.pages.add(t.dataset.rlpg);else E.pages.delete(t.dataset.rlpg);return}
 /* a permission brings the page it is used on with it */
 if(t.dataset.rlact!=null){const k=t.dataset.rlact;if(t.checked){E.can.add(k);const a=RL_ACTS.find(x=>x[0]===k);if(a&&a[3]&&!E.pages.has(a[3])){E.pages.add(a[3]);const c=document.querySelector('[data-rlpg="'+a[3]+'"]');if(c)c.checked=true}}else E.can.delete(k)}});
document.addEventListener("input",e=>{if(e.target.id==="rlEdName"&&RL.ed)RL.ed.name=e.target.value});
PG_LOAD.settings=()=>rlLoad();
/* ---------- On-time tab: OOOI times and on-time performance (see ooo.js) ---------- */
const OT={live:[],log:[],reasons:[],p:1,q:"",err:"",timer:0,loaded:false};
const otZ=t=>t?new Date(t).toISOString().slice(11,16)+"Z":"–";
const otDay=t=>new Date(t).toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"});
const otLate=(a,s)=>a&&s?Math.round((a-s)/6e4):null;
const otDur=(a,b)=>{if(!a||!b||b<a)return "–";const m=Math.round((b-a)/6e4);return Math.floor(m/60)+":"+String(m%60).padStart(2,"0")};
const otDelta=m=>m==null?'<span class="ot-na">–</span>':'<span class="ot-d '+(m>15?"late":"ok")+'" title="'+(m>15?"Late":"On time")+'">'+(m>0?"+":m<0?"−":"±")+Math.abs(m)+"</span>";
const otFrom=()=>{if(OT.p===1){const d=new Date();return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())}return Date.now()-OT.p*864e5};
const otReason=k=>(OT.reasons.find(x=>x[0]===(k||""))||["","Not given"])[1];
function otRows(){const from=otFrom(),q=OT.q.trim().toUpperCase();
 return OT.log.filter(r=>(r.in||r.done)>=from&&(!q||[r.cs,r.pilot,r.name,r.dep,r.arr,r.ac].some(v=>String(v||"").toUpperCase().includes(q)))&&(!OT.need||((otLate(r.out,r.std)>15||otLate(r.in,r.sta)>15)&&!r.reason))).sort((a,b)=>(b.in||b.done)-(a.in||a.done))}
function otStats(L){const sd=L.filter(r=>r.std&&r.out),sa=L.filter(r=>r.sta&&r.in);
 const avg=(A,f)=>A.length?Math.round(A.reduce((s,r)=>s+Math.max(0,f(r)),0)/A.length):null;
 return {n:L.length,sd:sd.length,sa:sa.length,d15:sd.filter(r=>otLate(r.out,r.std)<=15).length,a15:sa.filter(r=>otLate(r.in,r.sta)<=15).length,
  dAvg:avg(sd,r=>otLate(r.out,r.std)),aAvg:avg(sa,r=>otLate(r.in,r.sta)),nos:L.filter(r=>!r.std).length}}
function otCard(k,v,sub,frac){return '<div class="ot-k'+(frac==null?"":frac>=.8?" good":frac>=.6?" mid":" bad")+'"><span>'+esc(k)+"</span><b>"+esc(v)+"</b><small>"+esc(sub)+"</small></div>"}
function otKpiUi(L){const s=otStats(L),pc=(a,b)=>b?Math.round(a*100/b)+"%":"–",per=OT.p===1?"today (UTC)":"in the last "+OT.p+" days";
 $("#otKpi").innerHTML=otCard("Flights",String(s.n),"finished "+per+(OT.live.length?" · "+OT.live.length+" in progress now":""))+
  otCard("On-time departures",pc(s.d15,s.sd),s.sd?s.d15+" of "+s.sd+" off the gate within 15 min of STD":"No flight with a schedule yet",s.sd?s.d15/s.sd:null)+
  otCard("On-time arrivals",pc(s.a15,s.sa),s.sa?s.a15+" of "+s.sa+" at the gate within 15 min of STA":"No flight with a schedule yet",s.sa?s.a15/s.sa:null)+
  otCard("Average delay",s.dAvg==null?"–":"+"+s.dAvg+" min","per departure (early counts as 0) · arrivals "+(s.aAvg==null?"–":"+"+s.aAvg+" min"))+
  (s.nos?otCard("No schedule",String(s.nos),"flights without booking times, left out of the percentages"):"")}
function otWhyUi(L){const late=L.filter(r=>otLate(r.out,r.std)>15||otLate(r.in,r.sta)>15),el=$("#otWhy");
 if(!late.length){el.innerHTML=L.length?'<p class="hint">No flight was more than 15 minutes late '+(OT.p===1?"today":"in this period")+".</p>":"";return}
 const c={};late.forEach(r=>{const k=r.reason||"";c[k]=(c[k]||0)+1});const max=Math.max(1,...Object.values(c));
 el.innerHTML="<h3>Why flights were late ("+late.length+")</h3>"+'<div class="ot-bars">'+OT.reasons.filter(x=>c[x[0]]).sort((a,b)=>c[b[0]]-c[a[0]]).map(x=>'<div class="ot-b1"><span>'+esc(x[1])+'</span><i style="--w:'+Math.round(c[x[0]]*100/max)+'%"></i><b>'+c[x[0]]+"</b></div>").join("")+"</div>"}
function otStage(r){return r.in?"Parked":r.still?"Stopped":r.on?"Landed · taxiing in":r.off!=null?"Airborne":r.out?"Taxiing out":"At the gate"}
function otT(k,t,alt){return '<span class="ot-t'+(t?"":" no")+'"><i>'+k+"</i>"+(t?otZ(t):alt||"–")+"</span>"}
function otLiveUi(){const now=Date.now(),L=OT.live.slice().sort((a,b)=>(a.std||a.first)-(b.std||b.first)),el=$("#otLive");if(!el)return;
 if(!L.length){el.innerHTML='<span class="empty">'+(OT.loaded?"No Polaris flight is on the map right now.":"Loading…")+"</span>";return}
 el.innerHTML=L.map(r=>{const dl=r.out?otLate(r.out,r.std):r.std&&now>r.std?otLate(now,r.std):null;
  return '<div class="ot-f"><div class="ot-fh"><b>'+esc(r.cs)+"</b><span>"+esc((r.dep||"?")+" → "+r.arr)+"</span><small>"+esc([r.pilot,r.name,r.ac].filter(Boolean).join(" · "))+'</small><em class="ot-st">'+otStage(r)+'</em></div><div class="ot-ts">'+
   otT("STD",r.std,r.std?"":"no booking")+otT("OUT",r.out)+otT("OFF",r.off||null,r.off===0?"seen in the air":"")+otT("ON",r.on)+otT("IN",r.in)+otT("STA",r.sta)+
   (dl!=null&&(r.out||dl>15)?'<span class="ot-t"><i>'+(r.out?"DEP":"NOT OUT")+"</i>"+otDelta(dl)+"</span>":"")+"</div></div>"}).join("")}
function otLogUi(L){const el=$("#otLog");
 if(!L.length){el.innerHTML='<span class="empty">'+(!OT.loaded?"Loading…":OT.log.length?(OT.need?"No late flight without a delay reason ":"No finished flight ")+(OT.p===1?"today":"in this period")+(OT.q?" that matches":"")+".":"No finished flight yet. A flight shows here once it has landed and parked.")+"</span>";return}
 const opts=r=>OT.reasons.map(x=>'<option value="'+esc(x[0])+'"'+((r.reason||"")===x[0]?" selected":"")+">"+esc(x[1])+"</option>").join("");
 el.innerHTML='<div class="ot-tw"><table class="ot-tb"><thead><tr><th>Date</th><th>Flight</th><th>Route</th><th>STD</th><th>OUT</th><th>OFF</th><th>ON</th><th>IN</th><th>STA</th><th>Block</th><th>Dep.</th><th>Arr.</th><th>Delay reason</th></tr></thead><tbody>'+
  L.map(r=>{const dl=otLate(r.out,r.std),al=otLate(r.in,r.sta),late=dl>15||al>15;
   return "<tr><td>"+esc(otDay(r.in||r.done))+"</td><td><b>"+esc(r.cs)+"</b><small>"+esc([r.pilot,r.ac].filter(Boolean).join(" · "))+'</small></td><td class="m">'+esc((r.dep||"?")+" → "+r.arr)+'</td><td class="m">'+otZ(r.std)+'</td><td class="m">'+otZ(r.out)+'</td><td class="m">'+(r.off?otZ(r.off):"–")+'</td><td class="m">'+otZ(r.on)+'</td><td class="m">'+otZ(r.in)+'</td><td class="m">'+otZ(r.sta)+'</td><td class="m">'+otDur(r.out,r.in)+"</td><td>"+otDelta(dl)+"</td><td>"+otDelta(al)+"</td><td>"+
    (late||r.reason?'<select data-otr="'+esc(r.k)+'" data-otf="'+esc(r.first)+'" aria-label="Delay reason for '+esc(r.cs)+'">'+opts(r)+"</select>":'<span class="ot-na">–</span>')+"</td></tr>"}).join("")+"</tbody></table></div>"}
function otUi(){const L=otRows();otKpiUi(L);otWhyUi(L);otLiveUi();otLogUi(L);$("#otErr").innerHTML=OT.err?'<div class="msg err">'+esc(OT.err)+"</div>":""}
async function otLoad(){if(!pgHas("reports"))return;try{const j=await api("/admin/api/ooo");OT.live=j.live||[];OT.log=j.log||[];OT.reasons=j.reasons||[];OT.err=""}catch(e){OT.err=e.message}OT.loaded=true;
 const a=document.activeElement;if(a&&a.closest&&a.closest("#otLog select"))return;otUi()}
function otCsv(){const L=otRows(),iso=t=>t?new Date(t).toISOString().slice(0,16).replace("T"," "):"",q=v=>{const s=String(v==null?"":v);return /[",]/.test(s)?'"'+s.split('"').join('""')+'"':s};
 const head=["date","callsign","pilot","name","aircraft","dep","arr","std_utc","out_utc","off_utc","on_utc","in_utc","sta_utc","block_min","dep_delay_min","arr_delay_min","delay_reason"];
 const rows=L.map(r=>[iso(r.in||r.done).slice(0,10),r.cs,r.pilot,r.name,r.ac,r.dep,r.arr,iso(r.std),iso(r.out),iso(r.off),iso(r.on),iso(r.in),iso(r.sta),r.out&&r.in?Math.round((r.in-r.out)/6e4):"",otLate(r.out,r.std),otLate(r.in,r.sta),r.reason?otReason(r.reason):""]);
 const txt=[head,...rows].map(a=>a.map(q).join(",")).join(String.fromCharCode(10)),a=document.createElement("a");
 a.href=URL.createObjectURL(new Blob([txt],{type:"text/csv;charset=utf-8"}));a.download="polaris-on-time-"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-otp],#otCsv,#otReload,#otNeed");if(!t)return;
 if(t.id==="otNeed"){OT.need=!OT.need;t.setAttribute("aria-pressed",String(OT.need));otUi();return}
 if(t.dataset.otp){OT.p=+t.dataset.otp;document.querySelectorAll("[data-otp]").forEach(b=>b.setAttribute("aria-pressed",String(b===t)));otUi();return}
 if(t.id==="otCsv"){otCsv();return}
 t.disabled=true;otLoad().finally(()=>{t.disabled=false})});
document.addEventListener("change",async e=>{const t=e.target;if(!t.dataset||t.dataset.otr==null)return;const k=t.dataset.otr,first=+t.dataset.otf;t.disabled=true;
 try{await api("/admin/api/ooo/reason",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({k,first,reason:t.value})});const r=OT.log.find(x=>x.k===k&&x.first===first);if(r)r.reason=t.value;otWhyUi(otRows())}
 catch(er){OT.err=er.message;$("#otErr").innerHTML='<div class="msg err">'+esc(er.message)+"</div>"}finally{t.disabled=false}});
document.addEventListener("input",e=>{if(e.target.id==="otFind"){OT.q=e.target.value;otUi()}});
PG_LOAD.reports=()=>otLoad();PG_TICK.reports=[otLoad,60000];
/* ---------- Calendar tab: the company calendar and the vAMSYS events (see cal.js) ---------- */
const CA={items:[],vam:{},vamsys:[],vamErr:"",m:0,sel:null,form:null,day:null,err:"",busy:false,loaded:false};
const CA_TYPES=[["group","Group flight","#0A84FF"],["training","Training","#30B0C7"],["meeting","Meeting","#5E5CE6"],["event","Event","#FF9F0A"],["notice","Notice","#8E8E93"],["maint","Maintenance","#FF453A"]];
const CA_VAM="#AF52DE",CA_W=7*864e5,CA_D=864e5;
const caType=k=>CA_TYPES.find(x=>x[0]===k)||CA_TYPES[3];
const caZ=t=>new Date(t).toISOString().slice(11,16).replace(":","")+"Z";
const caDate=t=>new Date(t).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
const caLocal=t=>new Date(t).toLocaleString(undefined,{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const caPlain=h=>{const d=document.createElement("div");d.innerHTML=String(h||"");return (d.textContent||"").replace(/[ ]+/g," ").trim()};
const caMonth0=t=>{const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)};
const caDay0=t=>{const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())};
/* every occurrence that touches [a, b): { id, k (vAMSYS: "v"), s, e, v } */
function caOcc(a,b){const out=[];
 for(const v of CA.items){const dur=Math.max(6e4,(+v.e||+v.s+36e5)-v.s);
  if(v.rep==="weekly"){let k=Math.max(0,Math.floor((a-dur-v.s)/CA_W));for(let t=v.s+k*CA_W;t<b&&(!v.until||t<=v.until);t+=CA_W,k++)if(t+dur>a)out.push({id:v.id,s:t,e:t+dur,v})}
  else if(v.s<b&&v.s+dur>a)out.push({id:v.id,s:v.s,e:v.s+dur,v})}
 for(const x of CA.vamsys){const s=Date.parse(x.start||""),e=Date.parse(x.end||"")||s+36e5;if(s&&s<b&&e>a)out.push({id:"v"+x.id,s,e,x})}
 return out.sort((p,q)=>p.s-q.s)}
function caChip(o){const sel=CA.sel===o.id;
 if(o.x){const st=CA.vam[o.x.id]||{};return '<button type="button" class="ca-c vam'+(st.hide?" off":"")+(sel?" on":"")+'" data-cai="'+esc(o.id)+'" style="--c:'+CA_VAM+'" title="vAMSYS event'+(st.hide?" (hidden from the EFB)":"")+'">'+esc(o.x.name||"Event")+"</button>"}
 const t=caType(o.v.type);return '<button type="button" class="ca-c'+(o.v.efb?"":" draft")+(sel?" on":"")+'" data-cai="'+esc(o.id)+'" style="--c:'+t[2]+'" title="'+esc(t[1]+(o.v.efb?"":" · not in the EFB"))+'">'+(o.v.allDay?"":"<b>"+caZ(o.s)+"</b>")+esc(o.v.title)+"</button>"}
function caGridUi(){const m=CA.m,d=new Date(m),first=(d.getUTCDay()+6)%7,g0=m-first*CA_D,today=caDay0(Date.now());
 $("#caTitle").textContent=d.toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"UTC"});
 const occ=caOcc(g0,g0+42*CA_D);let h="";
 for(let i=0;i<42;i++){const a=g0+i*CA_D,b=a+CA_D,L=occ.filter(o=>o.s<b&&o.e>a),inM=new Date(a).getUTCMonth()===d.getUTCMonth();
  h+='<div class="ca-d'+(inM?"":" out")+(a===today?" today":"")+'" data-cad="'+a+'"><span class="n">'+new Date(a).getUTCDate()+"</span>"+L.slice(0,3).map(caChip).join("")+(L.length>3?'<span class="ca-more">+'+(L.length-3)+" more</span>":"")+"</div>"}
 $("#caGrid").innerHTML=h;
 $("#caLegend").innerHTML=CA_TYPES.map(t=>'<span><i style="--c:'+t[2]+'"></i>'+t[1]+"</span>").join("")+'<span><i style="--c:'+CA_VAM+'"></i>vAMSYS event</span><span style="opacity:.6"><i style="--c:var(--off)"></i><em>italic: not in the EFB</em></span>';
 $("#caErr").innerHTML=CA.err?'<div class="msg err">'+esc(CA.err)+"</div>":CA.vamErr?'<p class="hint">'+esc(CA.vamErr)+"</p>":""}
/* the side: what is coming, one day, an entry, or the form */
function caUp(o){const t=o.x?["","vAMSYS event",CA_VAM]:caType(o.v.type);
 return '<div class="ca-up" data-cai="'+esc(o.id)+'" style="--c:'+t[2]+'"><time>'+new Date(o.s).toISOString().slice(5,10).replace("-","/")+"<br>"+(o.v&&o.v.allDay?"all day":caZ(o.s))+"</time><b>"+esc(o.x?o.x.name||"Event":o.v.title)+"</b><small>"+esc(o.x?"vAMSYS event"+((CA.vam[o.x.id]||{}).hide?" · hidden from the EFB":""):[t[1],o.v.loc,o.v.rep==="weekly"?"weekly":"",o.v.efb?"":"not in the EFB"].filter(Boolean).join(" · "))+"</small></div>"}
function caSideUi(){const el=$("#caSide");
 if(CA.form){el.innerHTML=caFormHtml();caWhenUi();caWhoUi();return}
 if(CA.sel&&CA.sel[0]==="v"){const x=CA.vamsys.find(e=>"v"+e.id===CA.sel);if(x){el.innerHTML=caVamHtml(x);return}}
 if(CA.sel){const v=CA.items.find(i=>i.id===CA.sel);if(v){el.innerHTML=caItemHtml(v);return}}
 if(CA.day!=null){const L=caOcc(CA.day,CA.day+CA_D);el.innerHTML="<h3>"+esc(caDate(CA.day))+'</h3><div class="sub">'+(L.length?L.length+" on this day":"Nothing on this day")+"</div>"+L.map(caUp).join("")+'<div class="actions"><button type="button" class="primary" data-ca="newday">New entry on this day</button><button type="button" data-ca="close">Back</button></div>';return}
 const now=Date.now(),L=caOcc(now-6*36e5,now+30*CA_D).slice(0,40);
 el.innerHTML='<h3>Coming up</h3><div class="sub">The next 30 days. Pilots see entries marked “Show in the EFB” in the EFB’s Calendar app, all times UTC.</div>'+(L.length?L.map(caUp).join(""):'<span class="empty">Nothing planned.</span>')}
function caWhoTxt(to){return !to?"Everyone":to.crew?"The "+to.cs+" crew"+(to.m&&to.m.length?" ("+to.m.map(x=>x.pilot||"CID "+x.cid).join(", ")+")":""):(to.m||[]).map(x=>(x.pilot||"CID "+x.cid)+(x.name?" "+x.name:"")).join(", ")}
const CA_REM=[[0,"No reminder"],[15,"15 minutes before"],[30,"30 minutes before"],[60,"1 hour before"],[120,"2 hours before"],[1440,"1 day before"]];
function caItemHtml(v){const t=caType(v.type),dur=(+v.e||v.s)-v.s;
 return "<h3>"+esc(v.title)+'</h3><div class="sub" style="border-left:3px solid '+t[2]+';padding-left:8px">'+esc(t[1])+(v.efb?"":" · not in the EFB")+"</div>"+
  '<p style="margin:8px 0 0">'+esc(caDate(v.s))+"<br>"+(v.allDay?"All day"+(dur>CA_D?" · "+Math.round(dur/CA_D)+" days":""):caZ(v.s)+" – "+caZ(v.s+dur))+"</p>"+
  (v.rep==="weekly"?'<p class="hint" style="margin:4px 0 0">Every week'+(v.until?" until "+esc(caDate(v.until)):"")+"</p>":"")+
  (v.loc?'<p style="margin:6px 0 0">📍 '+esc(v.loc)+"</p>":"")+'<p class="hint" style="margin:6px 0 0">For: '+esc(caWhoTxt(v.to))+" · "+esc((CA_REM.find(r=>r[0]===(v.remind||0))||CA_REM[0])[1])+"</p>"+
  (v.body?'<div class="ca-desc">'+esc(v.body)+"</div>":"")+'<p class="hint" style="margin:8px 0 0">Added by '+esc(v.by||"")+(v.edBy?" · changed by "+esc(v.edBy):"")+"</p>"+
  '<div class="actions"><button type="button" class="primary" data-ca="edit">Edit</button><button type="button" data-ca="dup">Duplicate</button><button type="button" class="warn" data-ca="del">Delete</button><button type="button" data-ca="close">Close</button></div><div id="caMsg"></div>'}
function caVamHtml(x){const st=CA.vam[x.id]||{},s=Date.parse(x.start||""),e=Date.parse(x.end||"");
 return "<h3>"+esc(x.name||"Event")+'<span class="ca-tag">vAMSYS</span></h3><div class="sub">'+(s?esc(caDate(s))+" "+caZ(s):"")+(e?" – "+esc(caDate(e))+" "+caZ(e):"")+"</div>"+
  (x.points?'<p class="hint" style="margin:4px 0 0">'+x.points+(x.pointsAsPercentage?"%":"")+" points"+(x.registrationRequired?" · registration required":"")+"</p>":x.registrationRequired?'<p class="hint" style="margin:4px 0 0">Registration required</p>':"")+
  (x.description?'<div class="ca-desc">'+esc(caPlain(x.description).slice(0,1500))+"</div>":"")+
  '<label class="ca-chk"><input type="checkbox" id="caVShow"'+(st.hide?"":" checked")+"> Show in the EFB calendar</label>"+
  '<label for="caVNote">Polaris note <span class="hint" style="margin:0">shown with the event in the EFB</span></label><textarea id="caVNote" maxlength="1000" style="min-height:80px">'+esc(st.note||"")+"</textarea>"+
  '<div class="actions"><button type="button" class="primary" data-ca="vsave">Save</button><button type="button" data-ca="close">Close</button></div><div id="caMsg"></div><p class="hint">This event is managed in vAMSYS; changes there show here by themselves.</p>'}
function caFormHtml(){const f=CA.form,d=t=>new Date(t).toISOString().slice(0,10),hm=t=>new Date(t).toISOString().slice(11,16);
 return "<h3>"+(f.id?"Edit entry":"New entry")+'</h3><div class="sub">All times UTC</div>'+
  '<label for="caT">Title</label><input type="text" id="caT" maxlength="100" value="'+esc(f.title||"")+'" placeholder="Group flight RCTP–RJAA" autocomplete="off">'+
  '<label for="caType">Type</label><select id="caType">'+CA_TYPES.map(t=>'<option value="'+t[0]+'"'+(t[0]===f.type?" selected":"")+">"+t[1]+"</option>").join("")+"</select>"+
  '<label class="ca-chk"><input type="checkbox" id="caAll"'+(f.allDay?" checked":"")+"> All day</label>"+
  '<div class="ca-when"><span>Starts</span><input type="date" id="caSd" value="'+d(f.s)+'"><input type="time" id="caSt" value="'+hm(f.s)+'"><small id="caSl"></small><span>Ends</span><input type="date" id="caEd" value="'+d(f.e)+'"><input type="time" id="caEt" value="'+hm(f.e)+'"></div>'+
  '<div class="ca-two" style="margin-top:4px"><div><label for="caRep">Repeat</label><select id="caRep"><option value="">Does not repeat</option><option value="weekly"'+(f.rep==="weekly"?" selected":"")+">Every week</option></select></div>"+'<div id="caUntilW"><label for="caUntil">Until <span class="hint" style="margin:0">optional</span></label><input type="date" id="caUntil" value="'+(f.until?d(f.until):"")+'"></div></div>'+
  '<label for="caLoc">Place</label><input type="text" id="caLoc" maxlength="120" value="'+esc(f.loc||"")+'" placeholder="RCTP → RJAA, or the Discord channel" autocomplete="off">'+
  '<label for="caBody">Details</label><textarea id="caBody" maxlength="4000" style="min-height:110px" placeholder="What pilots need to know">'+esc(f.body||"")+"</textarea>"+
  '<label>For</label><div class="radio" id="caToR"><label><input type="radio" name="cato" value="all"'+(!f.to?" checked":"")+'> Everyone</label><label><input type="radio" name="cato" value="list"'+(f.to&&f.to.list?" checked":"")+'> Some pilots</label><label><input type="radio" name="cato" value="crew"'+(f.to&&f.to.crew?" checked":"")+'> A flight crew</label></div><div class="ca-who to-one" id="caWho" hidden></div>'+
  '<label for="caRem">Reminder</label><select id="caRem">'+CA_REM.map(r=>'<option value="'+r[0]+'"'+(r[0]===(f.remind||0)?" selected":"")+">"+r[1]+"</option>").join("")+'</select><p class="hint" style="margin:4px 0 0">A push notification to the pilots it is for (devices with Polaris notifications on), before each time.</p>'+
  '<label class="ca-chk"><input type="checkbox" id="caEfb"'+(f.efb!==false?" checked":"")+"> Show in the EFB calendar</label>"+
  '<div class="actions"><button type="button" class="primary" data-ca="save">'+(f.id?"Save changes":"Add to calendar")+'</button><button type="button" data-ca="cancel">Cancel</button></div><div id="caMsg"></div>'}
const caSay=(t,ok)=>{const m=$("#caMsg");if(m)m.innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
/* the form's times: back from its fields */
function caRead(){const f=CA.form,all=$("#caAll").checked,sd=$("#caSd").value,ed=$("#caEd").value||sd;
 const s=Date.parse(sd+"T"+(all?"00:00":($("#caSt").value||"00:00"))+":00Z");let e=Date.parse(ed+"T"+(all?"00:00":($("#caEt").value||"00:00"))+":00Z");
 if(all)e+=CA_D;return {s,e}}
function caWhenUi(){const all=$("#caAll").checked;["caSt","caEt"].forEach(i=>{$("#"+i).hidden=all});const r=caRead(),l=$("#caSl");
 if(l)l.textContent="";$("#caUntilW").style.visibility=$("#caRep").value==="weekly"?"visible":"hidden"}
function caWhoMode(){return (document.querySelector("input[name=cato]:checked")||{}).value||"all"}
function caWhoUi(){const f=CA.form,md=caWhoMode(),w=$("#caWho");w.hidden=md==="all";if(md==="all")return;if(typeof crPilots==="function")crPilots();
 const M=f.m||[];
 w.innerHTML=(md==="crew"?'<label for="caCs" style="margin-top:4px">Callsign</label><input type="text" id="caCs" maxlength="8" value="'+esc(f.cs||"")+'" placeholder="PAW123" autocomplete="off" spellcheck="false" style="text-transform:uppercase">':"")+
  '<label for="caAdd">'+(md==="crew"?"Pilots in the crew":"Pilots")+'</label><div class="cr-add"><input type="text" id="caAdd" list="crPilots" maxlength="12" placeholder="Pilot ID or VATSIM CID" autocomplete="off" spellcheck="false" style="text-transform:uppercase"><button type="button" data-ca="addp">Add</button></div>'+
  '<div class="cr-list">'+(M.length?M.map((x,i)=>'<span class="cr-p"><b>'+esc(x.pilot||"CID "+x.cid)+"</b>"+(x.name?"<small>"+esc(x.name)+"</small>":"")+'<button type="button" data-carm="'+i+'" aria-label="Remove">×</button></span>').join(""):'<span class="hint">'+(md==="crew"?"No pilots yet: any EFB flying this callsign sees it, from a day before.":"Add at least one pilot.")+"</span>")+"</div>"}
function caAddP(){const i=$("#caAdd"),v=i.value.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");if(!v)return;i.value="";const f=CA.form;f.m=f.m||[];
 const cid=/^[0-9]{4,9}$/.test(v),x=cid?{pilot:"",cid:v,name:""}:{pilot:v,cid:"",name:(typeof PLN!=="undefined"&&PLN[v])||""};
 if(f.m.some(y=>(x.pilot&&y.pilot===x.pilot)||(x.cid&&y.cid===x.cid)))return;f.m.push(x);caWhoUi();const n=$("#caAdd");if(n)n.focus()}
function caKeep(){const f=CA.form;if(!f||!$("#caT"))return;const r=caRead();
 Object.assign(f,{title:$("#caT").value,type:$("#caType").value,allDay:$("#caAll").checked,s:isFinite(r.s)?r.s:f.s,e:isFinite(r.e)?r.e:f.e,rep:$("#caRep").value,until:$("#caUntil").value?Date.parse($("#caUntil").value+"T23:59:00Z"):0,loc:$("#caLoc").value,body:$("#caBody").value,remind:+$("#caRem").value,efb:$("#caEfb").checked});
 const cs=$("#caCs");if(cs)f.cs=cs.value.toUpperCase().replace(/[^A-Z0-9]/g,"")}
function caUi(){caGridUi();caSideUi()}
/* one load at a time; one asked for meanwhile (after a save, say) runs once more when it is done, and waits for that */
async function caLoad(){if(!pgHas("cal"))return;if(CA.busy){CA.pend=true;return CA.tail||(CA.tail=new Promise(r=>{CA.tailR=r}))}CA.busy=true;try{const j=await api("/admin/api/cal");CA.items=j.items||[];CA.vam=j.vam||{};CA.vamsys=j.vamsys||[];CA.vamErr=j.vamsysErr||"";CA.err="";CA.loaded=true}catch(e){CA.err=e.message}finally{CA.busy=false}
 if(!CA.m)CA.m=caMonth0(Date.now());if(!CA.form)caUi();else caGridUi();
 if(CA.pend){CA.pend=false;const r=CA.tailR;CA.tail=null;CA.tailR=null;try{await caLoad()}finally{if(r)r()}}}
function caNew(day){const base=day!=null?day:caDay0(Date.now()),s=base+(day!=null?12:Math.min(23,new Date().getUTCHours()+1))*36e5;
 CA.form={title:"",type:"group",s,e:s+2*36e5,allDay:false,rep:"",until:0,loc:"",body:"",remind:60,efb:true,to:null,m:[],cs:""};CA.sel=null;caUi();setTimeout(()=>{const t=$("#caT");if(t)t.focus()},40)}
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("#cal [data-ca],#cal [data-cai],#cal [data-cad],#cal [data-carm]");if(!t)return;const a=t.dataset;
 if(a.cai){e.stopPropagation();caKeep();CA.form=null;CA.sel=a.cai;CA.day=null;caUi();if(innerWidth<1100)$("#caSide").scrollIntoView({behavior:"smooth",block:"start"});return}
 if(a.cad){if(CA.form)return;CA.sel=null;CA.day=+a.cad;caUi();return}
 if(a.carm!=null){caKeep();CA.form.m.splice(+a.carm,1);caWhoUi();return}
 const k=a.ca;
 if(k==="prev"||k==="next"){const d=new Date(CA.m);CA.m=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+(k==="next"?1:-1),1);caGridUi();return}
 if(k==="today"){CA.m=caMonth0(Date.now());caGridUi();return}
 if(k==="new"){caNew(null);return}if(k==="newday"){caNew(CA.day);return}
 if(k==="close"){CA.sel=null;CA.day=null;caUi();return}
 if(k==="cancel"){CA.form=null;caUi();return}
 if(k==="addp"){caKeep();caAddP();return}
 if(k==="edit"||k==="dup"){const v=CA.items.find(i=>i.id===CA.sel);if(!v)return;CA.form={...v,id:k==="edit"?v.id:undefined,title:k==="dup"?v.title+" (copy)":v.title,m:v.to&&v.to.m?v.to.m.slice():[],cs:v.to&&v.to.cs||""};if(k==="dup")CA.sel=null;caUi();return}
 if(k==="del"){const v=CA.items.find(i=>i.id===CA.sel);if(!v||!confirm('Delete "'+v.title+'"'+(v.rep==="weekly"?" and every week of it":"")+"? It goes off every EFB."))return;
  try{await api("/admin/api/cal?id="+encodeURIComponent(v.id),{method:"DELETE"});CA.sel=null;await caLoad()}catch(er){caSay(er.message)}return}
 if(k==="vsave"){const id=+CA.sel.slice(1);t.disabled=true;try{const j=await api("/admin/api/cal/vam",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,hide:!$("#caVShow").checked,note:$("#caVNote").value})});
  if(j.vam)CA.vam[id]=j.vam;else delete CA.vam[id];caGridUi();caSay("Saved.",true)}catch(er){caSay(er.message)}finally{t.disabled=false}return}
 if(k==="save"){caKeep();const f=CA.form,md=caWhoMode();
  if(!f.title.trim()){caSay("Give the entry a title.");return}if(!isFinite(f.s)){caSay("Pick the date it starts.");return}
  if(md==="crew"&&!f.cs){caSay("Write the flight's callsign.");return}if(md==="list"&&!(f.m||[]).length){caSay("Add the pilots it is for.");return}
  const body={id:f.id,title:f.title,type:f.type,s:f.s,e:f.e,allDay:f.allDay,rep:f.rep,until:f.until,loc:f.loc,body:f.body,remind:f.remind,efb:f.efb,to:md==="all"?null:md==="crew"?{crew:true,cs:f.cs,m:f.m}:{list:true,m:f.m}};
  t.disabled=true;try{const j=await api("/admin/api/cal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});CA.form=null;CA.sel=j.item.id;CA.m=caMonth0(j.item.s);await caLoad()}catch(er){caSay(er.message);t.disabled=false}return}});
document.addEventListener("input",e=>{const t=e.target;if(!t.closest||!t.closest("#caSide")||!CA.form)return;if(["caSd","caSt","caEd","caEt","caAll","caRep"].includes(t.id)){if(t.id==="caSd"){const ed=$("#caEd");if(ed&&ed.value<t.value)ed.value=t.value}caWhenUi()}});
document.addEventListener("change",e=>{const t=e.target;if(!t.closest||!t.closest("#caSide")||!CA.form)return;if(t.name==="cato"){caKeep();caWhoUi()}if(t.id==="caAll"||t.id==="caRep")caWhenUi()});
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="caAdd"){e.preventDefault();caKeep();caAddP()}});
PG_LOAD.cal=()=>caLoad();
/* ---------- Flight Watch (Live tab): alerts for the Polaris flights in the air (see watch.js) ---------- */
const FW={list:[],err:"",busy:false,loaded:false,seen:{}};
try{FW.seen=JSON.parse(localStorage.getItem("fwSeen")||"{}")||{}}catch(e){}
const fwKey=a=>a.k+"|"+a.title;
const fwSave=()=>{try{localStorage.setItem("fwSeen",JSON.stringify(FW.seen))}catch(e){}};
const fwShown=()=>FW.list.filter(a=>!FW.seen[fwKey(a)]);
function fwRows(){const by={};fwShown().forEach(a=>{if(!by[a.cs]||a.sev==="red")by[a.cs]=a.sev});
 document.querySelectorAll("#lvList [data-cs]").forEach(r=>{const s=by[r.dataset.cs];if(r.classList.contains("fw-red")!==(s==="red"))r.classList.toggle("fw-red",s==="red");if(r.classList.contains("fw-amber")!==(s==="amber"))r.classList.toggle("fw-amber",s==="amber")})}
function fwUi(){const L=fwShown(),red=L.some(a=>a.sev==="red"),n=$("#fwN");
 if(n){n.hidden=!L.length;n.textContent=String(L.length);n.classList.toggle("red",red);n.title=L.length?L.length+" Flight Watch alert"+(L.length===1?"":"s"):""}
 const box=$("#fwBox");if(!box)return;box.hidden=!FW.loaded&&!FW.err;const hid=FW.list.length-L.length;
 box.innerHTML='<div class="fw-h"><b>Flight Watch</b><span'+(!FW.err&&!L.length?' class="ok"':"")+'>'+(FW.err?esc(FW.err):L.length?L.length+" alert"+(L.length===1?"":"s"):"All normal")+"</span>"+(hid?'<button type="button" data-fw="unhide">Show '+hid+" hidden</button>":"")+"</div>"+
  L.map(a=>'<div class="fw-a '+a.sev+'"><i></i><div class="fw-t"><b>'+esc(a.cs)+"</b>"+esc(a.title)+"<small>"+esc(a.detail)+(a.pilot||a.name?" · "+esc(a.pilot||a.name):"")+'</small></div><div class="fw-b"><button type="button" data-fwshow="'+esc(a.cs)+'">Show</button><button type="button" data-fwaoc="'+esc(a.k)+'" title="AOC message to this crew">AOC</button><button type="button" data-fwseen="'+esc(fwKey(a))+'" title="Hide until it changes" aria-label="Hide">✕</button></div></div>').join("");
 fwRows();if(pgNow==="home")hmUi()}
async function fwLoad(){if(FW.busy||document.querySelector(".deny")||!pgHas("fw"))return;FW.busy=true;
 try{const j=await api("/admin/api/watch");FW.list=j.alerts||[];FW.err="";FW.loaded=true;
  /* a hidden alert that has gone is forgotten, so it shows again if it comes back */
  const now=new Set(FW.list.map(fwKey));let ch=false;for(const k of Object.keys(FW.seen))if(!now.has(k)){delete FW.seen[k];ch=true}if(ch)fwSave()}
 catch(e){FW.err="Flight Watch: "+e.message}finally{FW.busy=false}fwUi()}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest(".fw button");if(!b)return;
 if(b.dataset.fwshow){if(window.pmLive)window.pmLive.show(b.dataset.fwshow);return}
 if(b.dataset.fwaoc){const a=FW.list.find(x=>x.k===b.dataset.fwaoc);if(!a||!window.pmLive)return;const m0=FO.mode;
  /* already open: switched to AOC where it is (opening it again would be asked about, and keep Mail) */
  if(FO.f&&FO.f.cs===a.cs){FO.mode="aoc";if($("#foAoc"))foModeUi();else foUi();if(pgNow!=="fw")location.hash="#fw"}
  else{FO.mode="aoc";window.pmLive.show(a.cs);
   /* open now: its AOC; another flight kept open (an unsent message there): as it was */
   if(FO.f&&FO.f.cs===a.cs){FO.mode="aoc";foModeUi()}else if(FO.f)FO.mode=m0}
  setTimeout(()=>{if(FO.f&&FO.f.cs===a.cs&&FO.mode==="aoc"){const x=$("#foBody");if(x)x.focus()}},400);return}
 if(b.dataset.fwseen){FW.seen[b.dataset.fwseen]=Date.now();fwSave();fwUi();return}
 if(b.dataset.fw==="unhide"){FW.seen={};fwSave();fwUi()}});
/* the list is drawn again with every update: mark its rows again */
/* (P2) the list's marks, the CAM tags and the camera strip, once a frame however many updates asked for them */
let fwRowsRaf=0;function fwRowsNow(){fwRowsRaf=0;fwRows();foRows();fwCamStrip()}
function fwRowsSoon(){if(!fwRowsRaf)fwRowsRaf=requestAnimationFrame(fwRowsNow)}
{const l=$("#lvList");if(l)new MutationObserver(fwRowsSoon).observe(l,{childList:true})}
if(!document.querySelector(".deny")){fwLoad();setInterval(()=>{if(document.hidden)return;if(pgNow==="fw"||pgNow==="home"||Date.now()%90000<30000)fwLoad()},30000);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)fwLoad()})}
/* ---------- Flight Watch: the open flight's operations under its head (live.ts draws the map, the list and the head):
   OOOI against the schedule with the delay reason, the gates (change or assign), the final loadsheet, the AOC messages
   it got, and an AOC or Mail to its crew without leaving the flight ---------- */
const FO={f:null,edit:null,mode:"aoc"};
const foZ=t=>t?new Date(t).toISOString().slice(11,16)+"Z":"–";
const foKey=f=>f.cs+":"+f.dep+":"+f.arr;
const foMin=m=>(m>0?"+":m<0?"−":"±")+Math.abs(m)+" min";
const foChip=m=>m==null?"":'<span class="'+(m>15?"late":"ok")+'">'+foMin(m)+"</span>";
function foRec(f){const o=opsV("ooo");return o&&f?(o.live||[]).find(r=>r.k===foKey(f)&&!r.tomb)||null:null}
function foGates(f){const L=(opsV("stands")||{}).log||[];return {dep:L.find(x=>x.kind==="dep"&&x.cs===f.cs&&x.dep===f.dep)||null,arr:L.find(x=>x.kind!=="dep"&&x.cs===f.cs&&x.arr===f.arr)||null}}
/* AOC messages to this flight in the last 18 hours: to its callsign, or to its pilot */
function foAoc(f){const L=(opsV("aoc")||{}).msgs||[],since=Date.now()-18*36e5;
 return L.filter(m=>m.t>=since&&m.to&&((m.to.cs&&m.to.cs===f.cs)||(f.pilot&&(m.to.pilot===f.pilot||(m.to.m||[]).some(x=>x.pilot===f.pilot))))).sort((a,b)=>b.t-a.t)}
const foTo=f=>({crew:true,cs:f.cs,m:f.pilot||f.cid?[{pilot:f.pilot||"",cid:f.cid||"",name:f.name&&f.name!==f.pilot?f.name:""}]:[]});
async function foLoad(force){const age=force?0:20000;await Promise.allSettled([opsGet("ooo",age),opsGet("stands",age),opsGet("aoc",age)]);foInfoUi();foRows()}
/* (P2, Nov 2026) a part whose data could not be read says so, with Retry: never "Not sent", "None" or "Loading…" for
   what was simply not read. With data from before, that is shown, and the line says it is not current */
const foErr=k=>{const o=OPS[k];return o&&o.err?'<div class="msg err fo-err">'+esc(o.err)+(o.v?" (showing what came before)":"")+' <button type="button" class="lnk" data-foretry>Retry</button></div>':""};
const foWait=(k,h)=>OPS[k]&&OPS[k].err?foErr(k):'<p class="hint" style="margin:0">'+(h||"Loading…")+"</p>";
function foOooiHtml(f,r){
 if(!r)return '<div class="fo-s"><h4>OOOI <small>UTC</small></h4>'+(opsV("ooo")?foErr("ooo")+'<p class="hint" style="margin:0">No times yet: the Worker picks a flight up within two minutes of it showing on the map.</p>':foWait("ooo"))+"</div>";
 const now=Date.now(),cell=(k,t,sch,alt)=>'<div class="'+(t?"":"no ")+(sch?"sch":"")+'"><span>'+k+"</span><b>"+(t?foZ(t):alt||"–")+"</b></div>";
 const dl=r.out?otLate(r.out,r.std):r.std&&now>r.std?otLate(now,r.std):null,eta=r.in?null:f.eta,al=r.in?otLate(r.in,r.sta):r.sta&&eta?otLate(eta,r.sta):null;
 const dep=!r.std?"no booking, so no STD":r.out?"off the gate "+foChip(dl):now>r.std?'<span class="'+(dl>15?"late":"")+'">still at the gate, '+foMin(dl)+"</span>":"STD in "+Math.max(1,Math.round((r.std-now)/6e4))+" min";
 const arr=r.in?"at the gate "+foChip(al):eta?"ETA <b>"+foZ(eta)+"</b>"+(al!=null?" · "+foChip(al)+" expected":""):"–";
 const late=dl>15||al>15||r.reason,R=(opsV("ooo")||{}).reasons||[];
 return '<div class="fo-s"><h4>OOOI <small>UTC</small></h4>'+foErr("ooo")+'<div class="fo-t">'+cell("STD",r.std,1,"–")+cell("OUT",r.out)+cell("OFF",r.off||null,0,r.off===0?"air":"")+cell("ON",r.on)+cell("IN",r.in)+cell("STA",r.sta,1,"–")+"</div>"+
  '<div class="fo-d"><span><b>Departure</b> '+dep+"</span><span><b>Arrival</b> "+arr+"</span></div>"+
  (late&&R.length?'<div class="fo-r"><label for="foReason">Delay reason</label><select id="foReason">'+R.map(x=>'<option value="'+esc(x[0])+'"'+((r.reason||"")===x[0]?" selected":"")+">"+esc(x[1])+"</option>").join("")+"</select></div>":"")+"</div>"}
function foGatesHtml(f){if(!opsV("stands"))return '<div class="fo-s"><h4>Gates</h4>'+foWait("stands")+'<div id="foGSay"></div></div>';const G=foGates(f),plan=(opsV("stands")||{}).plan,lead=(plan&&plan.lead)||30,E=FO.edit;
 const row=kind=>{const x=G[kind],apt=kind==="dep"?f.dep:f.arr,lbl=kind==="dep"?"Departure":"Arrival";if(!apt)return "";
  const ed=E&&E.kind===kind?'<div class="fo-ge"><input type="text" id="foGate" maxlength="8" placeholder="Gate" value="'+esc(E.stand||"")+'" autocomplete="off" spellcheck="false"><input type="text" id="foTerm" maxlength="20" placeholder="Terminal" value="'+esc(E.term||"")+'" autocomplete="off" spellcheck="false" style="flex:0 1 96px">'+(x?"":'<button type="button" data-fog="pick" title="The first free gate in the plan">From plan</button>')+'<button type="button" class="primary" data-fog="send">'+(x?"Send GATE CHANGE":"Send gate")+'</button><button type="button" data-fog="x">Cancel</button></div>':"";
  if(x)return '<div class="fo-g"><span class="k">'+lbl+"<b>"+esc(apt)+'</b></span><span class="v">'+(x.stand?"Gate "+esc(x.stand)+(x.term?" · T"+esc(String(x.term).replace(/^T(ERMINAL)? */,"")):""):kind==="dep"?"Any free gate":"Contact ground")+"<small>"+(x.changed?"Changed ":"Sent ")+foZ(x.changed||x.t)+" · "+(x.by==="AUTO"?"automatic":esc(String(x.by||"").split("@")[0]))+"</small></span>"+(ed||f.sample?"":'<button type="button" data-fog="chg" data-fokind="'+kind+'">Change</button>')+ed+"</div>";
  const past=kind==="dep"&&!["gate","taxiout"].includes(f.phase);
  const why=kind==="dep"?(past?"Not needed: the flight has left the gate":plan&&plan.dep?"Goes when the crew check in":"Automatic departure gates are off"):plan&&plan.on?"Goes about "+lead+" min before landing":"Automatic arrival gates are off";
  return '<div class="fo-g none"><span class="k">'+lbl+"<b>"+esc(apt)+'</b></span><span class="v">Not sent<small>'+why+"</small></span>"+(past||ed||f.sample?"":'<button type="button" data-fog="new" data-fokind="'+kind+'">Assign</button>')+ed+"</div>"};
 return '<div class="fo-s"><h4>Gates</h4>'+foErr("stands")+row("dep")+row("arr")+'<div id="foGSay"></div></div>'}
function foLsHtml(f,r){if(!opsV("aoc"))return '<div class="fo-s"><h4>Final loadsheet</h4>'+foWait("aoc")+"</div>";const L=foAoc(f).find(m=>m.title==="LOADSHEET FINAL"),plan=(opsV("stands")||{}).plan,now=Date.now();let h;
 if(L)h='<span class="ok">Sent '+foZ(L.t)+"</span>"+akChip(L,opsV("aoc"))+'<details class="fo-a" data-aid="ls'+esc(L.id)+'"><summary><b>LOADSHEET FINAL</b><small>show</small></summary><pre>'+esc(L.body)+"</pre></details>";
 else if(plan&&plan.ls===false)h="Off<small>Automatic final loadsheets are off in Automatic messages.</small>";
 else if(r&&r.std&&now<r.std-15*6e4)h="Not yet<small>Goes at "+foZ(r.std-15*6e4)+", 15 minutes before STD, if the crew checked in with their SimBrief plan loaded.</small>";
 else if(r&&r.std)h="Not sent<small>The crew did not check in with a SimBrief plan loaded, so there were no weights to send.</small>";
 else h="Not sent<small>No booking (STD) for this flight.</small>";
 return '<div class="fo-s"><h4>Final loadsheet</h4>'+foErr("aoc")+'<div class="fo-ls">'+h+"</div></div>"}
function foLogHtml(f){if(!opsV("aoc"))return '<div class="fo-s"><h4>AOC to this flight</h4>'+foWait("aoc")+"</div>";const L=foAoc(f);
 return '<div class="fo-s"><h4>AOC to this flight <small>'+(L.length?L.length+" in the last 18 h":"")+"</small></h4>"+foErr("aoc")+(L.length?L.slice(0,10).map(m=>'<details class="fo-a" data-aid="'+esc(m.id)+'"><summary><b>'+esc(m.title)+"</b><time>"+foZ(m.t)+"</time>"+akChip(m,opsV("aoc"))+"<small>"+(m.by==="AUTO"?"automatic":esc(String(m.by||"").split("@")[0]))+"</small></summary><pre>"+esc(m.body)+"</pre>"+akList(m,opsV("aoc"))+"</details>").join(""):'<p class="hint" style="margin:0">None in the last 18 hours.</p>')+"</div>"}
function foMsgHtml(f){if(f.sample)return '<div class="fo-s"><h4>Message the crew</h4><p class="hint" style="margin:0">Sample flight: made up for the preview, so there is nobody to write to.</p></div>';
 const a=FO.mode==="aoc";
 return '<div class="fo-s fo-c"><div class="fo-ch"><h4>Message the crew</h4><div class="kf" role="group" aria-label="Send as"><button type="button" data-fom="aoc" aria-pressed="'+a+'">AOC</button><button type="button" data-fom="mail" aria-pressed="'+!a+'">Mail</button></div></div>'+
  '<div id="foAoc"'+(a?"":" hidden")+'><div class="row"><div><label for="foTpl">Template</label><select id="foTpl"></select></div><div><label for="foTitle">Title</label><input type="text" id="foTitle" maxlength="40" value="CREW MESSAGE" autocomplete="off" spellcheck="false"></div></div><label for="foBody">Message</label><textarea id="foBody" maxlength="2000" spellcheck="false" placeholder="Short, in capitals. The crew cannot answer an AOC message."></textarea><label class="ac-chk"><input type="checkbox" id="foPush" checked> Notify their devices</label><div class="actions"><button type="button" class="primary" id="foSend">Send AOC</button><a class="lk" href="#comms" data-fofull>Open in Messages</a></div></div>'+
  '<div id="foMail"'+(a?" hidden":"")+'><label for="foFrom">From</label><select id="foFrom"></select><label for="foSubj">Subject</label><input type="text" id="foSubj" maxlength="160" autocomplete="off"><label for="foMBody">Message</label><textarea id="foMBody" maxlength="20000" placeholder="Pilots read it in the EFB’s Mail and can answer."></textarea><div class="actions"><button type="button" class="primary" id="foMSend">Send mail</button><a class="lk" href="#comms" data-fofull>More options in Messages</a></div></div>'+
  '<div id="foSay"></div><p class="fo-to">To the '+esc(f.cs)+" crew"+(f.pilot||f.cid?" ("+esc(f.pilot||"CID "+f.cid)+(f.name&&f.name!==f.pilot?" · "+esc(f.name):"")+")":"")+", and any EFB flying "+esc(f.cs)+" for 18 hours.</p></div>"}
const foSay=(t,ok)=>{const m=$("#foSay");if(m)m.innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
function foTplUi(){const t=$("#foTpl");if(t)t.innerHTML='<option value="">Fill in from a template…</option>'+SETV.tpl.map((x,i)=>'<option value="'+i+'">'+esc(x.title)+"</option>").join("");
 const fr=$("#foFrom");if(fr){const v=fr.value;fr.innerHTML=SETV.froms.map(x=>"<option>"+esc(x)+"</option>").join("");fr.value=v&&SETV.froms.includes(v)?v:SETV.froms.includes("Flight Operations")?"Flight Operations":SETV.froms[0]}}
/* the parts that change with the data; left alone while staff type in them */
function foInfoUi(force){const f=FO.f,el=$("#foInfo");if(!f||!el)return;
 if(!force&&(FO.edit||(document.activeElement&&el.contains(document.activeElement))))return;
 const open=new Set([...el.querySelectorAll("details[open]")].map(d=>d.dataset.aid)),r=foRec(f);
 el.innerHTML=foOooiHtml(f,r)+foGatesHtml(f)+foLsHtml(f,r)+foLogHtml(f);
 el.querySelectorAll("details[data-aid]").forEach(d=>{if(open.has(d.dataset.aid))d.open=true})}
function foUi(){const box=$("#lvOps");if(!box)return;const f=FO.f;if(!f){box.innerHTML="";fwCamSync(true);return}
 /* the Cockpit Monitor has its own place: the parts drawn again with the data never touch its pictures */
 box.innerHTML='<div id="foCam"></div><div id="foInfo"></div><div id="foMsg">'+foMsgHtml(f)+"</div>";foTplUi();foInfoUi(true);foLoad();fwCamSync(true)}
/* the flight list: how late a flight is, beside its altitude */
function foRows(){fwCamRows();const o=opsV("ooo");if(!o)return;const now=Date.now(),F=window.pmLive?window.pmLive.flights():[];
 document.querySelectorAll("#lvList [data-cs]").forEach(row=>{const cs=row.dataset.cs,r=(o.live||[]).find(x=>x.cs===cs&&!x.tomb);let t="";
  if(r&&r.std&&r.off==null){const dl=r.out?otLate(r.out,r.std):now>r.std?otLate(now,r.std):null;if(dl>15)t="DEP +"+dl}
  else if(r&&r.sta&&r.in==null){const f=F.find(x=>x.cs===cs),al=f&&f.eta?otLate(f.eta,r.sta):null;if(al>15)t="ARR +"+al}
  let s=row.querySelector(".fo-x");if(!t){if(s)s.remove();return}
  if(!s){s=document.createElement("span");s.className="fo-x late";(row.querySelector(".lv-al")||row).appendChild(s)}s.textContent=t})}
/* the message being written to a flight's crew, kept per callsign: the panel is drawn again when another flight opens
   or the open one drops off the map (admin-live keeps it open through two updates first), and the writing comes back
   with the flight. Opening another flight by hand asks first (pmLeave, called by admin-live) */
FO.drafts={};
function foDraft(){if(!$("#foBody")&&!$("#foMBody"))return null;const v=id=>{const x=$(id);return x?x.value:""};
 return{mode:FO.mode,title:v("#foTitle"),body:v("#foBody"),subj:v("#foSubj"),mbody:v("#foMBody"),from:v("#foFrom"),push:$("#foPush")?$("#foPush").checked:true}}
const foDraftHas=d=>!!d&&!!(d.body.trim()||d.subj.trim()||d.mbody.trim()||(d.title.trim()&&d.title.trim().toUpperCase()!=="CREW MESSAGE"));
function foDraftPut(d){if(!d)return;const set=(id,v)=>{const x=$(id);if(x&&v!=null)x.value=v};set("#foTitle",d.title);set("#foBody",d.body);set("#foSubj",d.subj);set("#foMBody",d.mbody);
 const fr=$("#foFrom");if(fr&&d.from&&SETV.froms.includes(d.from))fr.value=d.from;const pu=$("#foPush");if(pu)pu.checked=d.push!==false}
function foDraftClear(){["#foBody","#foSubj","#foMBody"].forEach(id=>{const x=$(id);if(x)x.value=""});const t=$("#foTitle");if(t)t.value="CREW MESSAGE"}
/* AOC or Mail, as FO.mode says */
function foModeUi(){document.querySelectorAll("#lvOps [data-fom]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.fom===FO.mode)));const A=$("#foAoc"),M=$("#foMail");if(A)A.hidden=FO.mode!=="aoc";if(M)M.hidden=FO.mode!=="mail"}
/* admin-live, before another flight is opened (or this one closed) by hand: false keeps this one open */
window.pmLeave=cs=>{const f=FO.f;if(!f||f.cs!==cs)return true;const d=foDraft();if(!foDraftHas(d))return true;
 if(!confirm("Discard the message to the "+cs+" crew that is not sent yet?"))return false;
 delete FO.drafts[cs];foDraftClear();return true};
window.addEventListener("pm:sel",e=>{const old=FO.f;if(old){const d=foDraft();if(foDraftHas(d))FO.drafts[old.cs]=d;else delete FO.drafts[old.cs]}
 FO.f=e.detail;FO.edit=null;const d=FO.f&&FO.drafts[FO.f.cs];if(d)FO.mode=d.mode;foUi();
 if(d){foDraftPut(d);foSay("The message you had not sent is here again.",true)}});
window.addEventListener("pm:live",e=>{const L=e.detail||[];if(FO.f){const n=L.find(x=>x.cs===FO.f.cs);if(n){const ph=FO.f.phase;FO.f=n;if(n.phase!==ph)foInfoUi()}}fwRowsSoon()});
/* Retry, on a part of the panel whose data did not come */
document.addEventListener("click",async e=>{const b=e.target.closest&&e.target.closest("#lvOps [data-foretry]");if(!b||!FO.f)return;b.disabled=true;try{await foLoad(true)}finally{foInfoUi(true)}});
document.addEventListener("input",e=>{const t=e.target;if(FO.edit&&(t.id==="foGate"||t.id==="foTerm"))FO.edit[t.id==="foGate"?"stand":"term"]=t.value});
document.addEventListener("change",async e=>{const t=e.target,f=FO.f;if(!f)return;
 if(t.id==="foReason"){const r=foRec(f);if(!r)return;t.disabled=true;
  try{await api("/admin/api/ooo/reason",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({k:r.k,first:r.first,reason:t.value})});r.reason=t.value}
  catch(er){alert(er.message)}finally{t.disabled=false}return}
 if(t.id==="foTpl"){const x=SETV.tpl[+t.value];t.value="";if(!x)return;const b=$("#foBody");
  if(b.value.trim()&&!confirm("Replace what you wrote with the "+x.title+" template?"))return;
  $("#foTitle").value=x.title;b.value=tplFill(x.body,f);tplCaret(b)}});
document.addEventListener("click",async e=>{const b=e.target.closest&&e.target.closest("#lvOps [data-fog],#lvOps [data-fom],#foSend,#foMSend,#lvOps [data-fofull]");if(!b)return;const f=FO.f;if(!f)return;const d=b.dataset;
 if(d.fom){FO.mode=d.fom;foModeUi();foSay("");return}
 if(d.fofull!=null){e.preventDefault();const a=FO.mode==="aoc",ti=a?$("#foTitle").value:$("#foSubj").value,bo=a?$("#foBody").value:$("#foMBody").value,fr=$("#foFrom").value;
  if(!window.pmCompose({pilot:f.pilot,cid:f.cid,cs:f.cs,name:f.name},a?"aoc":"mail"))return;if(a){if(ti)$("#acTitle").value=ti;if(bo)$("#acBody").value=bo;acPreview()}else{$("#from").value=fr;if(ti)$("#subject").value=ti;if(bo)$("#body").value=bo;preview()}return}
 if(d.fog==="chg"||d.fog==="new"){const x=foGates(f)[d.fokind];FO.edit={kind:d.fokind,x:x?{k:x.k,t:x.t}:null,stand:"",term:x&&x.term||""};foInfoUi(true);const g=$("#foGate");if(g)g.focus();return}
 if(d.fog==="x"){FO.edit=null;foInfoUi(true);return}
 if(d.fog==="pick"){const E=FO.edit;if(!E)return;b.disabled=true;
  try{const j=await api("/admin/api/stands/try",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({icao:E.kind==="dep"?f.dep:f.arr,dep:f.dep,arr:f.arr,ac:f.ac,acName:f.acName,fpAc:f.fpAc,wake:f.wake})});
   if(j.stand){E.stand=j.stand;E.term=j.term||"";$("#foGate").value=E.stand;$("#foTerm").value=E.term;$("#foGSay").innerHTML=""}else $("#foGSay").innerHTML='<div class="msg err">'+(j.none==="full"?"Every gate in the plan is taken: write one.":"No gate plan for "+esc(E.kind==="dep"?f.dep:f.arr)+": write the gate.")+"</div>"}
  catch(er){$("#foGSay").innerHTML='<div class="msg err">'+esc(er.message)+"</div>"}finally{b.disabled=false}return}
 if(d.fog==="send"){const E=FO.edit;if(!E)return;const stand=($("#foGate").value||"").trim(),term=($("#foTerm").value||"").trim();
  if(!stand){$("#foGate").focus();return}b.disabled=true;
  try{if(E.x)await api("/admin/api/stands/change",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({k:E.x.k,t:E.x.t,stand,term:term||undefined})});
   else{const r=foRec(f);await api("/admin/api/stands/assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:E.kind,cs:f.cs,dep:f.dep,arr:f.arr,ac:f.ac,acName:f.acName,fpAc:f.fpAc,wake:f.wake,eta:E.kind==="dep"?r&&r.std:f.eta,pilot:f.pilot,cid:f.cid,name:f.name,stand,term})})}
   const mine=()=>FO.f&&FO.f.cs===f.cs;if(mine())FO.edit=null;opsDrop("stands");opsDrop("aoc");await foLoad(true);
   /* (P2) another flight opened meanwhile: its panel is not told of this one */
   if(mine()){foInfoUi(true);const s=$("#foGSay");if(s)s.innerHTML='<div class="msg ok">Sent to the '+esc(f.cs)+" crew.</div>"}}
  catch(er){if(FO.f&&FO.f.cs===f.cs){const s=$("#foGSay");if(s)s.innerHTML='<div class="msg err">'+esc(er.message)+"</div>"}b.disabled=false}return}
 if(b.id==="foSend"){const body=$("#foBody").value.trim();if(!body){foSay("Write the message first.");$("#foBody").focus();return}if(/___/.test(body)){foSay("Fill in the ___ first.");tplCaret($("#foBody"));return}
  b.disabled=true;try{await api("/admin/api/aoc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:$("#foTitle").value,body,to:foTo(f),push:$("#foPush").checked})});
   $("#foBody").value="";$("#foTitle").value="CREW MESSAGE";foSay("AOC sent to the "+f.cs+" crew.",true);opsDrop("aoc");foLoad(true);load()}catch(er){foSay(er.message)}finally{b.disabled=false}return}
 if(b.id==="foMSend"){const subject=$("#foSubj").value.trim(),body=$("#foMBody").value.trim();if(!subject||!body){foSay("Write a subject and a message.");return}
  b.disabled=true;try{await api("/admin/api/mail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:foTo(f),from:$("#foFrom").value,subject,body,keepAtt:[],newAtt:[]})});
   $("#foSubj").value="";$("#foMBody").value="";foSay("Mail sent to the "+f.cs+" crew.",true);load()}catch(er){foSay(er.message)}finally{b.disabled=false}}});
PG_LOAD.fw=()=>{fwLoad();foLoad();fwCamLoad()};PG_TICK.fw=[()=>foLoad(),45000];
/* ---------- Messages page: Inbox, Sent and Scheduled on the left; the conversation, the message or the composer on the right ---------- */
const CM={seg:"inbox",pane:"empty",item:""};
function cmUi(){const s=CM.seg,P=CM.pane;
 document.querySelectorAll("[data-cmv]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.cmv===s)));
 $("#cmFi").hidden=s!=="inbox";$("#cmFs").hidden=s!=="sent";$("#ibList").hidden=s!=="inbox";$("#list").hidden=s==="inbox";
 $("#cmEmpty").hidden=P!=="empty";$("#ibView").hidden=P!=="thread";$("#cmItem").hidden=P!=="item";$("#cmCompose").hidden=P!=="compose";$("#cmSet").hidden=P!=="set"}
function cmPane(p){CM.pane=p;if(p!=="thread"&&IB.sel){IB.sel="";ibUi()}if(p!=="item")CM.item="";cmUi();listUi()}
function cmSeg(s){CM.seg=s;cmUi();listUi()}
/* something written in the composer that would be lost */
const cmDirty=()=>!!(S.edit||$("#subject").value.trim()||$("#body").value.trim()||$("#acBody").value.trim()||S.add.length);
/* a new notice (Mail) or AOC message: AOC goes to a flight's crew unless staff pick otherwise */
function cmNew(k){if(CM.pane==="compose"&&cmDirty()&&!confirm("Discard the message you are writing?"))return;
 reset();kindSet(k);if(k==="aoc")toSet({crew:true,cs:"",m:[]});$("#acTitle").value="CREW MESSAGE";$("#acBody").value="";acPreview();say("");cmPane("compose");if(innerWidth<900)requestAnimationFrame(()=>$("#cmCompose").scrollIntoView({behavior:"smooth",block:"start"}));
 setTimeout(()=>{const e=k==="aoc"?$("#crCs"):$("#subject");if(e)e.focus()},50)}
/* an old address: #aoc opens a new AOC message, #inbox the Inbox */
function cmAsk(a){if(a==="aoc")cmNew("aoc");else if(a==="inbox")cmSeg("inbox");else if(a==="templates"){cmPane("set");setLoad()}
 else if(a==="sent"){S.kf="aoc";document.querySelectorAll("[data-kf]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.kf==="aoc")));cmSeg("sent")}}
/* an AOC message (Home's "has not accepted"): shown from the list there is, or Flight Watch's copy of it (one just sent
   from there), and again once the list has come from the server; "Loading…" meanwhile, never an empty pane */
async function cmAocOpen(id){const item="aoc:"+id,have=()=>S.aoc.some(m=>m.id===id);
 if(!have()){const v=opsV("aoc"),m=v&&(v.msgs||[]).find(x=>x.id===id);if(m){S.aoc=[m].concat(S.aoc);if(!S.aocV)S.aocV=v}}
 if(S.kf==="mail"){S.kf="all";document.querySelectorAll("[data-kf]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.kf==="all")))}
 CM.seg="sent";CM.item=item;CM.pane="item";if(IB.sel){IB.sel="";ibUi()}S.loading++;cmUi();listUi();
 try{await load()}finally{S.loading--}
 if(CM.item===item&&CM.pane==="item")listUi()}
/* a conversation (Home's "waiting for a reply") */
function ibOpen(th){IB.sel=th;const t=(IB.threads||[]).find(x=>x.th===th);if(t&&t.done!==(IB.show==="done")){IB.show=t.done?"done":"open";document.querySelectorAll("[data-ibs]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.ibs===IB.show)))}
 CM.seg="inbox";CM.pane="thread";cmUi();ibUi();
 if(t&&!t.read){t.read=true;ibCount();api("/admin/api/inbox/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({th:t.th,read:true})}).catch(()=>{})}}
const cmWhen=t=>{const d=new Date(t),n=new Date();return d.toISOString().slice(0,10)===n.toISOString().slice(0,10)?d.toISOString().slice(11,16)+"Z":d.toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"})};
function listUi(){const now=Date.now(),seg=CM.seg,nq=S.mails.filter(m=>m.sendAt>now).length,q=$("#cmLaterN");if(q){q.hidden=!nq;q.textContent=nq}
 if(seg==="inbox")return;
 const mails=S.mails.filter(m=>seg==="later"?m.sendAt>now:m.sendAt<=now);
 const L=[...(seg==="sent"&&S.kf==="aoc"?[]:mails.map(m=>({k:"mail",t:m.sendAt,m}))),...(seg!=="sent"||S.kf==="mail"?[]:S.aoc.map(m=>({k:"aoc",t:m.t,m})))].sort((a,b)=>seg==="later"?a.t-b.t:b.t-a.t);
 $("#list").innerHTML=(S.listErr?'<div class="msg err" style="margin:12px 18px">'+esc(S.listErr)+"</div>":"")+(L.length?L.map(({k,m})=>{const id=k+":"+m.id,on=CM.item===id?" on":"";
   if(k==="aoc")return '<button type="button" class="cm-i'+on+'" data-cmi="'+esc(id)+'"><b><span class="cm-k">AOC</span>'+esc(m.title)+"</b><time>"+cmWhen(m.t)+'</time><span class="meta">'+akChip(m,S.aocV)+esc((m.to?toWho(m.to):"All pilots")+(m.by==="AUTO"?" · automatic":"")+" · "+m.body.slice(0,90))+"</span></button>";
   return '<button type="button" class="cm-i'+on+'" data-cmi="'+esc(id)+'"><b>'+esc(m.subject)+"</b><time>"+(m.sendAt>now?fmt(m.sendAt):cmWhen(m.sendAt))+'</time><span class="meta">'+esc(m.from+" → "+(m.to?toWho(m.to):"all pilots"))+(m.att.length?" · 📎 "+m.att.length:"")+"</span></button>"}).join("")
  :'<p class="empty" style="padding:16px 18px">'+(seg==="later"?"Nothing scheduled.":S.kf==="aoc"?"No AOC messages yet.":S.kf==="mail"?"No notices yet.":"Nothing sent yet.")+"</p>");
 if(CM.pane==="item")cmItemUi()}
function cmItemUi(){const i=CM.item.indexOf(":"),k=CM.item.slice(0,i),id=CM.item.slice(i+1),el=$("#cmItem"),x='<button type="button" class="cm-x" data-cmclose aria-label="Close">✕</button>';
 if(k==="aoc"){const m=S.aoc.find(v=>v.id===id);if(!m&&S.loading){el.innerHTML='<div class="cm-v"><div class="cm-ch"><h3>AOC message</h3>'+x+'</div><p class="empty">Loading…</p></div>';return}if(!m){CM.pane="empty";CM.item="";cmUi();return}
  el.innerHTML='<div class="cm-v"><div class="cm-ch"><h3>'+esc(m.title)+'<span class="tag a">AOC</span></h3>'+x+'</div><div class="meta">'+fmt(m.t)+" · to "+esc(m.to?toLabel(m.to):"all pilots")+(m.by?" · "+(m.by==="AUTO"?"sent automatically":"by "+esc(m.by)):"")+'</div><div class="ac-box"><div class="h">AOC MSG DISPLAY</div><div class="b"><i>'+esc(m.title)+" "+cmZ(m.t)+"</i>"+esc(m.body)+"</div></div>"+(akOf(m,S.aocV)?'<h4 class="ak-h">On the flight deck</h4>'+akList(m,S.aocV)+'<p class="hint">The message stays on the pilot’s EFB until ACCEPT or REJECT.</p>':m.to?"":'<p class="hint">To all pilots: read in Messages, no ACCEPT asked.</p>')+'<div class="actions"><button class="warn" data-acdel="'+esc(m.id)+'">Delete</button></div><p class="hint">Deleting takes it off every EFB.</p></div>';return}
 const m=S.mails.find(v=>v.id===id);if(!m){CM.pane="empty";CM.item="";cmUi();return}const q=m.sendAt>Date.now();
 el.innerHTML='<div class="cm-v"><div class="cm-ch"><h3>'+esc(m.subject)+'<span class="tag '+(q?"q":"s")+'">'+(q?"SCHEDULED":"SENT")+"</span></h3>"+x+'</div><div class="meta">From '+esc(m.from)+" · to "+esc(m.to?toLabel(m.to):"all pilots")+" · "+(q?"goes out ":"")+fmt(m.sendAt)+(m.by?" · by "+esc(m.by):"")+(m.edited?" · edited":"")+'</div><div class="cm-body">'+md(m.body)+"</div>"+
  (m.att.length?'<ul class="atts">'+m.att.map(a=>"<li>📎 "+esc(a.name)+' <span class="hint" style="margin:0">'+kb(a.size)+"</span></li>").join("")+"</ul>":"")+
  '<div class="actions"><button data-edit="'+esc(m.id)+'">Edit</button><button class="warn" data-del="'+esc(m.id)+'">Delete</button></div></div>'}
const cmZ=t=>{const d=new Date(t);return String(d.getUTCHours()).padStart(2,"0")+String(d.getUTCMinutes()).padStart(2,"0")+"Z"};
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-cmv],[data-cmnew],[data-cmi],[data-cmclose],[data-cmset],[data-ib],[data-edit]");if(!b)return;const d=b.dataset;
 if(d.cmset!=null){if(CM.pane==="compose"&&cmDirty()&&!confirm("Discard the message you are writing?"))return;cmPane("set");setLoad();return}
 if(d.cmv){cmSeg(d.cmv);return}
 if(d.cmnew){cmNew(d.cmnew);return}
 if(d.cmi){CM.item=d.cmi;CM.pane="item";if(IB.sel){IB.sel="";ibUi()}cmUi();listUi();if(innerWidth<900)$("#cmItem").scrollIntoView({behavior:"smooth",block:"start"});return}
 if(d.cmclose!=null){if(CM.pane==="compose"&&cmDirty()){if(!confirm("Discard this message?"))return;reset();say("")}if(CM.pane==="set"&&SE.dirty){if(!confirm("Discard the changes to the From names and templates?"))return;SE.dirty=false;SE.tpl=null}cmPane("empty");return}
 if(d.ib){CM.pane="thread";CM.item="";cmUi();listUi();if(innerWidth<900)setTimeout(()=>$("#ibView").scrollIntoView({behavior:"smooth",block:"start"}),30);return}
 if(d.edit){CM.pane="compose";CM.item="";cmUi();return}});
/* a template fills in the title and the message (Messages › From names and templates) */
$("#acTpl").addEventListener("change",e=>{const t=SETV.tpl[+e.target.value];e.target.value="";if(!t)return;
 if($("#acBody").value.trim()&&$("#acBody").value.trim()!==tplFill(t.body,{}).trim()&&!confirm("Replace what you wrote with the "+t.title+" template?"))return;
 const to=toGet(),cs=to&&to.crew?to.cs:to&&to.cs||"",f=cs&&window.pmLive?window.pmLive.flights().find(x=>x.cs===cs):null;
 $("#acTitle").value=t.title;$("#acBody").value=tplFill(t.body,{cs,dep:f&&f.dep,arr:f&&f.arr});acPreview();tplCaret($("#acBody"))});
PG_LOAD.comms=()=>{ibLoad();load();cmUi()};
/* who accepted: looked at again while the page is open (not over a message being written) */
PG_TICK.comms=[()=>{if(CM.pane!=="compose")load()},30000];
/* ---------- Home: the time, the operation at a glance, and what needs someone now. Each item opens the page
   where it is dealt with. ---------- */
const hmDay0=()=>{const d=new Date();return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())};
const hmGround=f=>f.gs<45&&f.alt<15000;
const hmNm=(a,b,c,d)=>{const R=Math.PI/180,x=Math.sin((c-a)*R/2)**2+Math.cos(a*R)*Math.cos(c*R)*Math.sin((d-b)*R/2)**2;return 6880.13*Math.asin(Math.min(1,Math.sqrt(x)))};
/* minutes until a flight lands (as the Worker reckons it for the arrival gate), or null on the ground */
function hmTtg(f,apts){if(hmGround(f))return null;
 if(f.remain!=null&&isFinite(f.remain)&&f.remain>=0&&f.gs>100)return f.remain/f.gs*60+4;
 const e=Date.parse(f.eta||"");if(isFinite(e))return (e-Date.now())/6e4;
 const a=apts&&apts[f.arr];return a&&f.gs>100?hmNm(f.lat,f.lon,a[0],a[1])/f.gs*60+8:null}
/* the clock: six split-flap digits; a digit that changes flips (0.32 s), the others stay still. Reduce Motion, or a
   page in the background, just changes them */
const HMC={last:"",cells:null};
const hmHalf=(k,ch)=>'<span class="fh '+k+'"><i>'+ch+'</i></span>';
function hmFlapBuild(c){let h="";for(let i=0;i<6;i++){if(i===2||i===4)h+='<span class="fs">:</span>';h+='<span class="fd"></span>'}
 c.className="flapclk";c.innerHTML='<span aria-hidden="true" style="display:contents">'+h+'<span class="fz">Z</span></span>';HMC.cells=[...c.querySelectorAll(".fd")];HMC.last=""}
function hmClock(){const c=$("#hmClock");if(!c||pgNow!=="home")return;const d=new Date(),t=d.toISOString().slice(11,19).split(":").join("");
 if(!HMC.cells||!c.contains(HMC.cells[0]))hmFlapBuild(c);
 const calm=document.hidden||matchMedia("(prefers-reduced-motion: reduce)").matches;
 for(let i=0;i<6;i++){const ch=t[i],old=HMC.last?HMC.last[i]:"";if(ch===old)continue;const el=HMC.cells[i];el.dataset.v=ch;
  if(!old||calm){el.innerHTML=hmHalf("ft",ch)+hmHalf("fb",ch);continue}
  el.innerHTML=hmHalf("ft",ch)+hmHalf("fb",old)+hmHalf("ft fl1",old)+hmHalf("fb fl2",ch);
  setTimeout(()=>{if(el.dataset.v===ch)el.innerHTML=hmHalf("ft",ch)+hmHalf("fb",ch)},380)}
 if(!HMC.last||HMC.last.slice(0,4)!==t.slice(0,4))c.setAttribute("aria-label","UTC "+t.slice(0,2)+":"+t.slice(2,4));
 HMC.last=t;
 $("#hmDate").textContent=d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})+" · UTC"}
/* on the second, so each flip lands as the second changes */
(function hmTick(){hmClock();setTimeout(hmTick,1005-Date.now()%1000)})();
/* what Home shows of each page the role sees */
const hmNeed=()=>{const f=pgHas("fw");return [f&&"live",(f||pgHas("reports"))&&"ooo",f&&"stands",(f||pgHas("comms"))&&"aoc",pgHas("navdata")&&"nav"].filter(Boolean)};
async function hmLoad(){const age={live:15000,ooo:30000,stands:30000,aoc:30000,nav:600000};
 await Promise.allSettled(hmNeed().map(k=>opsGet(k,age[k])).concat([ibLoad(),CA.loaded?null:caLoad(),tkLoad()]));hmUi()}
function hmUi(){if(pgNow!=="home")return;const P=pgHas,N=hmNeed(),v=k=>N.includes(k)?opsV(k):null;
 const lv=v("live"),oo=v("ooo"),st=v("stands"),F=(lv&&lv.flights)||[],now=Date.now(),d0=hmDay0();
 const air=F.filter(f=>!hmGround(f)).length,logs=(oo&&oo.log)||[],live=((oo&&oo.live)||[]).filter(r=>!r.tomb);
 const deps=[...logs,...live].filter(r=>r.std&&r.out&&r.out>=d0),arrs=logs.filter(r=>r.sta&&r.in&&r.in>=d0);
 const d15=deps.filter(r=>otLate(r.out,r.std)<=15).length,a15=arrs.filter(r=>otLate(r.in,r.sta)<=15).length;
 const al=P("fw")?fwShown():[],red=al.some(a=>a.sev==="red");
 const card=(href,k,v,sub,cls)=>'<a class="hm-c'+(cls?" "+cls:"")+'" href="'+href+'"><span>'+k+"</span><b>"+v+"</b><small>"+sub+"</small></a>";
 const pc=(a,b)=>b?Math.round(a*100/b)+"%":"–",fr=(a,b)=>b?(a/b>=.8?"good":a/b>=.6?"mid":"bad"):"";
 $("#hmK").innerHTML=(P("fw")?card("#fw","In the air",lv?String(air):"–",!lv?"loading…":F.length?(F.length-air)+" on the ground":"no Polaris flight now"):"")+
  (P("reports")?card("#reports","On-time departures",pc(d15,deps.length),deps.length?d15+" of "+deps.length+" today (D15)":"none today yet",fr(d15,deps.length))+
  card("#reports","On-time arrivals",pc(a15,arrs.length),arrs.length?a15+" of "+arrs.length+" today (A15)":"none today yet",fr(a15,arrs.length)):"")+
  (P("fw")?card("#fw","Flight Watch",FW.loaded?(al.length?String(al.length):"Normal"):"–",FW.loaded?(al.length?"alert"+(al.length>1?"s":"")+" to look at":"no alerts"):"loading…",al.length?(red?"red":"mid"):FW.loaded?"good":""):"")+
  (()=>{const L=TK.list||[],op=L.filter(t=>t.state!=="done"),lt=op.filter(t=>tkLate(t,now)).length;
   return TK.pub?card("#tasks","Open tasks",TK.list?String(op.length):"–",!TK.list?"loading…":lt?lt+" overdue":"none overdue",lt?"red":"")
    :card("#tasks","My tasks",TK.list?String(L.filter(tkMineOf).length):"–",!TK.list?"loading…":op.filter(t=>t.state==="doing").length+" in progress in "+(TK.depts[0]?esc(TK.depts[0].name):"the department"))})();
 hmTkUi();
 /* what needs someone, the most urgent first */
 const A=[];
 al.slice().sort((a,b)=>(a.sev==="red"?0:1)-(b.sev==="red"?0:1)).forEach(a=>A.push({sev:a.sev,t:"<b>"+esc(a.cs)+"</b> "+esc(a.title),s:esc(a.detail),go:"fw:"+a.cs,l:"Flight Watch"}));
 if(P("fw"))live.filter(r=>r.std&&!r.out&&now-r.std>15*6e4).forEach(r=>A.push({sev:"amber",t:"<b>"+esc(r.cs)+"</b> still at the gate",s:Math.round((now-r.std)/6e4)+" min after STD "+otZ(r.std)+" · "+esc((r.dep||"?")+" → "+r.arr)+(r.reason?"":" · no delay reason yet"),go:"fw:"+r.cs,l:"Flight Watch"}));
 const plan=st&&st.plan,slog=(st&&st.log)||[],lead=(plan&&plan.lead)||30;
 if(st)F.forEach(f=>{const m=hmTtg(f,lv&&lv.apts);if(m==null||m<-5||m>Math.max(45,lead+15)||!f.arr)return;if(slog.some(x=>x.kind!=="dep"&&x.cs===f.cs&&x.arr===f.arr))return;
  const has=plan&&plan.apts&&(plan.apts[f.arr]||[]).length;
  A.push({sev:m<=lead?"amber":"info",t:"<b>"+esc(f.cs)+"</b> lands at "+esc(f.arr)+" in about "+Math.max(1,Math.round(m))+" min with no gate",s:!plan||!plan.on?"Automatic arrival gates are off":!has?"No gate plan for "+esc(f.arr):m>lead?"The automatic gate goes "+lead+" min before landing":"No gate was sent",go:"fw:"+f.cs,l:"Assign"})});
 /* an AOC message the crew has not accepted 10 minutes on */
 const av=v("aoc");((av&&av.msgs)||[]).forEach(m=>{const k=akOf(m,av);if(!k)return;const cs=m.to.cs||"",who=cs||m.to.pilot||"crew",onMap=cs&&F.some(f=>f.cs===cs);
  if(!onMap&&!P("comms"))return;
  if(k.rej&&now-m.t<3*36e5){A.push({sev:"red",t:"<b>"+esc(who)+"</b> rejected "+esc(m.title),s:"Sent "+akZ(m.t)+" · rejected "+akZ(k.L.find(x=>x.r).r),go:onMap?"fw:"+cs:"aoc:"+m.id,l:onMap?"Flight Watch":"Messages"});return}
  if(!k.late)return;
  A.push({sev:"amber",t:"<b>"+esc(who)+"</b> has not accepted "+esc(m.title),s:"Sent "+akZ(m.t)+" · "+(k.del?"on the EFB, waiting for ACCEPT":"not on an EFB yet")+(k.acc?" · "+k.acc+" of "+k.L.length+" accepted":""),go:onMap?"fw:"+cs:"aoc:"+m.id,l:onMap?"Flight Watch":"Messages"})});
 /* navigation data that is not current, or a source that is not answering (Nav Data) */
 const nv=v("nav");if(nv){ndBadge(nv);(nv.src||[]).filter(x=>x.state==="bad"||x.state==="warn").forEach(x=>A.push({sev:x.state==="bad"?"red":"amber",t:"<b>"+esc(x.region)+"</b> "+esc(x.name)+": "+esc(x.line),s:esc(x.by)+" · "+esc(x.how),go:"nav:"+x.id,l:"Nav Data"}))}
 (P("comms")&&IB.threads||[]).filter(t=>!t.done&&t.waiting).forEach(t=>{const last=t.msgs[t.msgs.length-1];A.push({sev:"info",t:"<b>"+esc(t.pilot)+"</b> → "+esc(t.dept)+": "+esc(t.subj),s:"Waiting for a reply · "+esc(ago(last.t)),go:"ib:"+t.th,l:"Reply"})});
 const need=logs.filter(r=>(r.in||r.done)>=now-7*864e5&&(otLate(r.out,r.std)>15||otLate(r.in,r.sta)>15)&&!r.reason);
 if(P("reports")&&need.length)A.push({sev:"info",t:need.length+" late flight"+(need.length>1?"s have":" has")+" no delay reason",s:"The last 7 days: "+esc(need.slice(0,5).map(r=>r.cs).join(", "))+(need.length>5?" …":""),go:"need",l:"Reports"});
 const errs=["live","ooo","stands"].filter(k=>N.includes(k)).map(k=>OPS[k]&&OPS[k].err).filter(Boolean);
 const ready=N.every(k=>OPS[k]&&(OPS[k].v||OPS[k].err))&&(!P("comms")||IB.threads||IB.err);
 $("#hmAct").innerHTML=(errs.length?'<div class="msg err" style="margin:0 0 8px">'+esc(errs.join(" · "))+"</div>":"")+(A.length?A.map(a=>'<button type="button" class="hm-i '+a.sev+'" data-hmgo="'+esc(a.go)+'"><i></i><span class="t">'+a.t+"<small>"+a.s+"</small></span><em>"+a.l+" ›</em></button>").join("")
  :ready?'<div class="hm-ok"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9"/></svg>Nothing needs attention right now.</div>':'<span class="empty">Loading…</span>');
 $("#hmAt").textContent=ready?"Updated "+new Date().toISOString().slice(11,16)+"Z":"";
 /* the flights on the map, the next to land first */
 const FL=F.map(f=>({f,m:hmTtg(f,lv&&lv.apts)})).sort((a,b)=>(a.m==null?1e9:a.m)-(b.m==null?1e9:b.m));
 $("#hmFl").innerHTML=!lv?'<span class="empty">Loading…</span>':FL.length?FL.slice(0,12).map(({f,m})=>{const g=hmGround(f);
   return '<button type="button" class="hm-f" data-hmgo="fw:'+esc(f.cs)+'"><span class="cs">'+esc(f.cs)+'</span><span class="rt">'+esc((f.dep||"····")+" → "+(f.arr||"····"))+"<small>"+esc(f.ac||"")+'</small></span><span class="st"><b>'+(g?(f.gs<3?"Parked":"Taxiing"):f.alt>=18000?"FL"+String(Math.round(f.alt/100)).padStart(3,"0"):Math.round(f.alt).toLocaleString("en-US")+" ft")+"</b>"+(m!=null&&m>0?"ETA "+new Date(now+m*6e4).toISOString().slice(11,16)+"Z":esc(f.vphase||(g?"on the ground":"")))+"</span></button>"}).join("")+(FL.length>12?'<a class="lk" href="#fw">'+(FL.length-12)+" more in Flight Watch ›</a>":"")
  :'<p class="empty" style="margin:6px 0">No Polaris flight on the map right now.</p>';
 /* the calendar's next two days */
 const up=CA.loaded?caOcc(now-36e5,now+2*864e5).slice(0,6):null;
 $("#hmUp").innerHTML=!up?'<span class="empty">Loading…</span>':up.length?up.map(o=>'<a class="hm-u" href="#cal" data-hmcal="'+esc(o.id)+'" data-hms="'+o.s+'"><time>'+esc(new Date(o.s).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",timeZone:"UTC"}))+"<br>"+(o.v&&o.v.allDay?"all day":caZ(o.s))+"</time><b>"+esc(o.x?o.x.name||"Event":o.v.title)+"</b><small>"+esc(o.x?"vAMSYS event":caType(o.v.type)[1]+(o.v.loc?" · "+o.v.loc:""))+"</small></a>").join("")
  :'<p class="empty" style="margin:6px 0">Nothing in the next two days.</p>'}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-hmgo],[data-hmcal]");if(!b)return;
 if(b.dataset.hmcal){CA.sel=b.dataset.hmcal;CA.day=null;CA.form=null;CA.m=caMonth0(+b.dataset.hms);return}
 const g=b.dataset.hmgo;
 if(g.startsWith("fw:")){location.hash="#fw";if(window.pmLive)window.pmLive.show(g.slice(3));return}
 if(g.startsWith("ib:")){ibOpen(g.slice(3));location.hash="#comms";return}
 if(g.startsWith("nav:")){ND.tab="all";ND.q="";{const q=$("#ndQ");if(q)q.value=""}location.hash="#navdata";setTimeout(()=>{const c=document.getElementById("nd-"+g.slice(4));if(c){c.scrollIntoView({block:"center"});c.classList.add("flash");setTimeout(()=>c.classList.remove("flash"),1600)}},700);return}
 if(g.startsWith("aoc:")){location.hash="#comms";cmAocOpen(g.slice(4));return}
 if(g==="need"){OT.need=true;OT.p=7;document.querySelectorAll("[data-otp]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.otp==="7")));const n=$("#otNeed");if(n)n.setAttribute("aria-pressed","true");location.hash="#reports"}});
PG_LOAD.home=()=>{hmClock();hmUi();hmLoad()};PG_TICK.home=[hmLoad,30000];
/* ---------- Tasks (Nov 2026): published to a department (a role) by an administrator, or a role with "Publish tasks",
   and worked on by that department's people: start, finish, take or pass on, add notes. The server keeps a member to
   their own department's tasks (tasks.js). TK.list: open tasks, and those finished in the last 14 days. ---------- */
const TK={list:null,depts:[],people:[],me:"",role:"",pub:false,err:"",dept:"",mine:false,sel:"",det:null,form:null,busy:false,say:null,mail:null};
const TK_ST=[["todo","To do"],["doing","In progress"],["done","Done"]],TK_PRI=["Normal","High","Urgent"];
const tkName=e=>e?String(e).split("@")[0]:"";
const tkInit=e=>tkName(e).replace(/[^a-z0-9]/gi,"").slice(0,2).toUpperCase()||"?";
const tkDept=id=>{const d=TK.depts.find(x=>x.id===id);return d?d.name:"(role deleted)"};
const tkZ=t=>new Date(t).toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"})+" "+new Date(t).toISOString().slice(11,16)+"Z";
const tkLate=(t,now)=>t.state!=="done"&&!!t.due&&t.due<now;
/* for me: on me, or nobody's yet in my department */
const tkMineOf=t=>t.state!=="done"&&(t.who===TK.me||(!t.who&&t.dept===TK.role));
/* (P2) TK.lq: the latest load, or a change: an answer that set out before either is dropped */
async function tkLoad(){if(document.querySelector(".deny"))return;const q=TK.lq=(TK.lq||0)+1;
 try{const j=await api("/admin/api/tasks");if(q!==TK.lq)return;TK.list=j.tasks||[];TK.depts=j.depts||[];TK.people=j.people||[];TK.me=j.me||"";TK.role=j.role||"";TK.pub=!!j.pub;TK.mail=j.mail||null;TK.err=""}
 catch(e){if(q!==TK.lq)return;TK.err=e.message}
 tkCount();if(pgNow==="tasks")tkUi(1);if(pgNow==="home")hmUi()}
function tkCount(){const n=(TK.list||[]).filter(tkMineOf).length,b=$("#tkCount");if(b){b.hidden=!n;b.textContent=n}}
function tkSort(L,st){return L.slice().sort(st==="done"?(a,b)=>b.done-a.done:(a,b)=>(b.pri-a.pri)||((a.due||9e15)-(b.due||9e15))||(st==="doing"?a.started-b.started:b.t-a.t))}
function tkMerge(t){if(!TK.list)return;const i=TK.list.findIndex(x=>x.id===t.id);if(i>=0)TK.list[i]=t;else TK.list.unshift(t);tkCount()}
function tkSay(t,ok,d){TK.say=t?{t,ok:!!ok,d:!!d}:null}
const tkBusyIn=()=>{const a=document.activeElement,d=$("#tkDet");return !!(a&&d&&d.contains(a)&&a.matches("textarea,select"))};
function tkUi(bg){if(!$("#tkBoard"))return;tkToolsUi();tkBoardUi();if(!bg||!tkBusyIn())tkDetUi();
 const S=TK.say;$("#tkMsg").innerHTML=S&&!S.d?'<div class="msg '+(S.ok?"ok":"err")+'">'+esc(S.t)+"</div>":"";const dm=$("#tkDMsg");if(dm)dm.innerHTML=S&&S.d?'<div class="msg '+(S.ok?"ok":"err")+'">'+esc(S.t)+"</div>":""}
function tkToolsUi(){const sel=$("#tkDept");sel.hidden=!TK.pub;
 if(TK.pub){if(TK.dept&&!TK.depts.some(d=>d.id===TK.dept))TK.dept="";sel.innerHTML='<option value="">All departments</option>'+TK.depts.map(d=>'<option value="'+esc(d.id)+'"'+(d.id===TK.dept?" selected":"")+">"+esc(d.name)+"</option>").join("")}
 document.querySelectorAll("[data-tkmine]").forEach(b=>b.setAttribute("aria-pressed",String((b.dataset.tkmine==="1")===TK.mine)));
 /* task emails (taskmail.js): each person turns them off for themselves */
 {const M=TK.mail,el=$("#tkMail");if(el)el.innerHTML=!M?"":'<label title="When a task is published or passed to you (or to your department while nobody is on it), when one you published is done, and a day before one of yours is due"><input type="checkbox" data-tkmail'+(M.on?" checked":"")+(M.ready?"":" disabled")+"> Email me about my tasks</label>"+(M.ready?(M.on?"<small> · to "+esc(TK.me)+"</small>":""):"<small> · email isn’t set up on the server yet</small>")}
 $("#tkSub").textContent=!TK.list?"":TK.pub?"Publish tasks to a department; its people start them, finish them and add notes.":TK.depts[0]?"The tasks for "+TK.depts[0].name+": start one, finish it, or pass it to someone else in the department.":""}
function tkCard(t,now){const late=tkLate(t,now);
 return '<button type="button" class="tk-c p'+t.pri+(t.state==="done"?" done":"")+(t.id===TK.sel?" sel":"")+'" data-tk="'+esc(t.id)+'"><span class="t">'+esc(t.title)+'</span><span class="tk-m">'
  +(TK.pub&&!TK.dept?'<span class="tk-dp">'+esc(tkDept(t.dept))+"</span>":"")+(t.pri?'<span class="tk-pri p'+t.pri+'">'+TK_PRI[t.pri]+"</span>":"")
  +'<span class="tk-p">'+(t.who?'<i class="tk-av">'+esc(tkInit(t.who))+"</i>"+esc(tkName(t.who)):"Not taken")+"</span>"
  +(t.state==="done"?"<span>Done "+esc(cmWhen(t.done))+"</span>":t.due?'<span class="'+(late?"tk-late":"")+'">'+(late?"Overdue · ":"Due ")+esc(tkZ(t.due))+"</span>":"")
  +(t.notes?"<span>"+t.notes+" note"+(t.notes>1?"s":"")+"</span>":"")+"</span></button>"}
function tkBoardUi(){const el=$("#tkBoard");
 if(!TK.list){el.innerHTML=TK.err?'<div class="msg err">'+esc(TK.err)+"</div>":'<span class="empty">Loading…</span>';return}
 const now=Date.now(),L=TK.list.filter(t=>(!TK.dept||t.dept===TK.dept)&&(!TK.mine||t.who===TK.me));
 el.innerHTML=TK_ST.map(([s,n])=>{const C=tkSort(L.filter(t=>t.state===s),s);
  return '<div class="tk-col '+s+'"><h3><i></i>'+n+" <b>"+C.length+"</b>"+(s==="done"?"<small>last 14 days</small>":"")+"</h3>"
   +(C.length?C.map(t=>tkCard(t,now)).join(""):'<span class="empty">'+(s==="todo"?"Nothing waiting.":s==="doing"?"Nobody is on a task.":"Nothing finished lately.")+"</span>")+"</div>"}).join("")}
function tkEvHtml(e){const who="<b>"+esc(tkName(e.by)||"Someone")+"</b>",w="<time>"+esc(cmWhen(e.t))+"</time>";
 if(e.k==="note")return '<div class="tk-e note">'+who+w+'<div class="tk-md">'+md(e.v)+"</div></div>";
 const F={title:"the title",body:"the details",pri:"the priority",due:"the due time"};
 const s=e.k==="made"?"published it":e.k==="edit"?"changed "+String(e.v||"").split(",").map(k=>F[k]||k).join(", "):e.k==="dept"?"moved it to "+tkDept(e.v)
  :e.k==="who"?(!e.v?"left it for anyone":e.v===e.by?"took it":"gave it to "+tkName(e.v)):e.k==="state"?(e.v==="doing"?"started it":e.v==="done"?"finished it":"put it back to To do"):e.k;
 return '<div class="tk-e">'+who+" "+esc(s)+w+"</div>"}
function tkDetUi(){const box=$("#tkDet"),on=!!TK.sel;$("#tkBody").classList.toggle("on",on);box.hidden=!on;if(!on){box.innerHTML="";return}
 const D=TK.det;if(!D||D.task.id!==TK.sel){box.innerHTML='<span class="empty">Loading…</span>';return}
 const t=D.task,now=Date.now(),late=tkLate(t,now),mem=TK.pub||t.dept===TK.role,ppl=TK.people.filter(p=>p.role===t.dept),old=$("#tkNote"),keep=old?old.value:"";
 box.innerHTML='<div class="pf-h"><div><div class="tk-dp">'+esc(tkDept(t.dept))+"</div><h3>"+esc(t.title)+'</h3></div><button type="button" class="cm-x" data-tkx aria-label="Close">✕</button></div>'
  +'<div class="ib-seg tk-st" role="group" aria-label="State">'+TK_ST.map(([s,n])=>'<button type="button" data-tkst="'+s+'" aria-pressed="'+(t.state===s)+'"'+(mem?"":" disabled")+">"+n+"</button>").join("")+"</div>"
  +'<div class="tk-kv"><span>Person</span><select id="tkWho" aria-label="Person"'+(mem?"":" disabled")+'><option value="">Not taken</option>'
   +ppl.map(p=>'<option value="'+esc(p.email)+'"'+(p.email===t.who?" selected":"")+">"+esc(p.email)+(p.email===TK.me?" (you)":"")+"</option>").join("")
   +(t.who&&!ppl.some(p=>p.email===t.who)?'<option value="'+esc(t.who)+'" selected>'+esc(t.who)+"</option>":"")+"</select>"
  +"<span>Priority</span><div>"+(t.pri?'<span class="tk-pri p'+t.pri+'">'+TK_PRI[t.pri]+"</span>":"Normal")+"</div>"
  +"<span>Due</span><div"+(late?' class="tk-late"':"")+">"+(t.due?(late?"Overdue · ":"")+esc(tkZ(t.due)):"No due time")+"</div>"
  +"<span>Published</span><div>"+esc(tkZ(t.t))+" by "+esc(tkName(t.by))+"</div></div>"
  +(t.body?'<div class="tk-md">'+md(t.body)+"</div>":"")
  +(TK.pub?'<div class="actions" style="margin-top:12px"><button type="button" data-tkedit>Edit</button><button type="button" class="warn" data-tkdel>Delete</button></div>':"")
  +'<div id="tkDMsg"></div><div class="fo-s" style="margin-top:14px"><h4>Activity</h4><div class="tk-ev">'+D.evs.map(tkEvHtml).join("")+"</div>"
  +'<textarea id="tkNote" maxlength="2000" placeholder="A note for the department"></textarea><div class="actions" style="margin-top:8px"><button type="button" id="tkNoteAdd">Add note</button></div></div>';
 const n=$("#tkNote");if(n&&keep)n.value=keep}
function tkFormUi(){const f=$("#tkForm"),F=TK.form;f.hidden=!F;if(!F){f.innerHTML="";return}
 const ppl=TK.people.filter(p=>p.role===F.dept),gone=F.dept&&!TK.depts.some(d=>d.id===F.dept);
 f.innerHTML='<label for="tkTitle">'+(F.id?"Edit the task":"New task")+'</label><input type="text" id="tkTitle" maxlength="120" placeholder="What needs doing" value="'+esc(F.title)+'" autocomplete="off">'
  +'<label for="tkBodyIn">Details <small>optional · **bold**, - lists</small></label><textarea id="tkBodyIn" maxlength="4000" placeholder="Anything they need to know">'+esc(F.body)+"</textarea>"
  +'<div class="tk-f2"><div><label for="tkFDept">Department</label><select id="tkFDept">'+TK.depts.map(d=>'<option value="'+esc(d.id)+'"'+(d.id===F.dept?" selected":"")+">"+esc(d.name)+"</option>").join("")+(gone?'<option value="'+esc(F.dept)+'" selected>(role deleted)</option>':"")+"</select></div>"
  +'<div><label for="tkFWho">Person</label><select id="tkFWho"><option value="">Anyone in the department</option>'+ppl.map(p=>'<option value="'+esc(p.email)+'"'+(p.email===F.who?" selected":"")+">"+esc(p.email)+"</option>").join("")+"</select></div>"
  +'<div><label for="tkFPri">Priority</label><select id="tkFPri">'+TK_PRI.map((n,i)=>'<option value="'+i+'"'+(i===F.pri?" selected":"")+">"+n+"</option>").join("")+"</select></div>"
  +'<div><label for="tkFDue">Due <small>UTC, optional</small></label><input type="datetime-local" id="tkFDue" value="'+(F.due?new Date(F.due).toISOString().slice(0,16):"")+'"></div></div>'
  +'<div class="actions"><button class="primary" type="button" id="tkFSave">'+(F.id?"Save":"Publish")+'</button><button type="button" id="tkFCancel">Cancel</button></div>'}
function tkFormRead(){const F=TK.form;if(!F||!$("#tkTitle"))return;F.title=$("#tkTitle").value;F.body=$("#tkBodyIn").value;F.dept=$("#tkFDept").value;F.who=$("#tkFWho").value;F.pri=+$("#tkFPri").value||0;
 const v=$("#tkFDue").value,d=v?Date.parse(v+":00Z"):0;F.due=isFinite(d)?d:0}
async function tkOpen(id){TK.sel=id;if(!TK.det||TK.det.task.id!==id)TK.det=null;tkSay(null);tkUi();
 if(innerWidth<=1100)setTimeout(()=>{const b=$("#tkDet");if(b&&!b.hidden)b.scrollIntoView({block:"start",behavior:"smooth"})},30);
 try{const j=await api("/admin/api/tasks?id="+encodeURIComponent(id));if(TK.sel===id){TK.det=j;tkMerge(j.task)}}
 catch(e){if(TK.sel===id){TK.sel="";TK.det=null;tkSay(e.message)}}
 if(pgNow==="tasks")tkUi()}
/* one change at a time: one made while another is on its way waits for it, then goes (never dropped) */
let tkQ=Promise.resolve();
function tkPost(body,el,ok){if(el)el.disabled=true;const p=tkQ.then(()=>tkPost1(body,el,ok));tkQ=p.then(()=>{},()=>{});return p}
async function tkPost1(body,el,ok){TK.busy=true;TK.lq=(TK.lq||0)+1;if(el)el.disabled=true;
 try{const j=await api("/admin/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  tkSay(null);if(j.task){tkMerge(j.task);if(TK.sel===j.task.id)TK.det={task:j.task,evs:j.evs||[]}}
  if(body.op==="del"){TK.list=(TK.list||[]).filter(t=>t.id!==body.id);if(TK.sel===body.id){TK.sel="";TK.det=null}}
  if(ok)ok(j);return j}
 catch(e){tkSay(e.message,false,["state","who","note"].includes(body.op)&&!!TK.sel);return null}
 finally{TK.busy=false;TK.lq++;if(el)el.disabled=false;tkCount();tkUi();if(pgNow==="home")hmUi()}}
async function tkTick(){await tkLoad();if(!TK.sel||pgNow!=="tasks")return;
 try{const id=TK.sel,q=TK.lq,j=await api("/admin/api/tasks?id="+encodeURIComponent(id));if(TK.sel===id&&!TK.busy&&q===TK.lq){TK.det=j;tkMerge(j.task);if(!tkBusyIn())tkDetUi()}}catch(e){}}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-tk],[data-tknew],[data-tkmine],[data-tkx],[data-tkst],[data-tkedit],[data-tkdel],#tkNoteAdd,#tkFSave,#tkFCancel,[data-hmtk],[data-hmdept]");if(!b)return;
 if(b.dataset.tk){tkOpen(b.dataset.tk);return}
 if(b.dataset.hmtk){TK.sel=b.dataset.hmtk;TK.det=null;location.hash="#tasks";return}
 if(b.dataset.hmdept!=null){TK.dept=b.dataset.hmdept;TK.mine=false;TK.sel="";TK.det=null;location.hash="#tasks";return}
 if(b.hasAttribute("data-tknew")){const d=TK.dept||(TK.depts.find(x=>x.id!=="admin")||TK.depts[0]||{}).id||"";TK.form={id:"",title:"",body:"",dept:d,who:"",pri:0,due:0};tkSay(null);tkFormUi();tkUi();$("#tkTitle").focus();return}
 if(b.dataset.tkmine!=null){TK.mine=b.dataset.tkmine==="1";tkUi();return}
 if(b.hasAttribute("data-tkx")){TK.sel="";TK.det=null;tkSay(null);tkUi();return}
 const t=TK.det&&TK.det.task;
 if(b.dataset.tkst){if(t)tkPost({op:"state",id:t.id,state:b.dataset.tkst},b);return}
 if(b.hasAttribute("data-tkedit")){if(!t)return;TK.form={id:t.id,title:t.title,body:t.body,dept:t.dept,who:t.who,pri:t.pri,due:t.due};tkSay(null);tkFormUi();tkUi();$("#tkForm").scrollIntoView({block:"nearest"});$("#tkTitle").focus();return}
 if(b.hasAttribute("data-tkdel")){if(!t||!confirm('Delete the task "'+t.title+'"? Its notes go with it.'))return;tkPost({op:"del",id:t.id},b,()=>tkSay("Deleted "+t.title+".",true));return}
 if(b.id==="tkNoteAdd"){if(!t)return;const v=$("#tkNote").value.trim();if(!v){tkSay("Write the note first",false,true);tkUi();return}tkPost({op:"note",id:t.id,text:v},b,()=>{$("#tkNote").value=""});return}
 if(b.id==="tkFSave"){tkFormRead();const F=TK.form;if(!F.title.trim()){tkSay("Give the task a title");tkUi();$("#tkTitle").focus();return}
  tkPost({op:F.id?"edit":"new",id:F.id||undefined,title:F.title,body:F.body,dept:F.dept,who:F.who,pri:F.pri,due:F.due},b,j=>{TK.form=null;tkFormUi();tkSay(F.id?"Saved.":"Published to "+tkDept(F.dept)+".",true);if(j.task&&!F.id&&innerWidth>1100){TK.sel=j.task.id;TK.det={task:j.task,evs:j.evs||[]}}});return}
 if(b.id==="tkFCancel"){TK.form=null;tkSay(null);tkFormUi();tkUi();return}});
document.addEventListener("change",e=>{const t=e.target;
 if(t.id==="tkDept"){TK.dept=t.value;tkUi();return}
 if(t.id==="tkFDept"){tkFormRead();TK.form.who="";tkFormUi();return}
 if(t.id==="tkWho"){const k=TK.det&&TK.det.task;if(k)tkPost({op:"who",id:k.id,who:t.value},t)}});
document.addEventListener("change",async e=>{const c=e.target;if(!c||!c.matches||!c.matches("[data-tkmail]"))return;
 try{const j=await api("/admin/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({op:"mail",on:c.checked})});TK.mail=Object.assign(TK.mail||{},j.mail||{});tkSay(c.checked?"You get task emails again.":"No more task emails for you.",true)}
 catch(er){c.checked=!c.checked;tkSay(er.message,false)}tkUi()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&pgNow==="tasks"&&TK.sel&&!(e.target.closest&&e.target.closest("input,textarea,select"))){TK.sel="";TK.det=null;tkUi()}});
PG_LOAD.tasks=()=>{tkUi();tkLoad().then(()=>{if(TK.sel&&(!TK.det||TK.det.task.id!==TK.sel))tkOpen(TK.sel)})};PG_TICK.tasks=[tkTick,30000];
/* the count beside Tasks in the menu, while another page is open (Home asks for the tasks itself) */
if(!document.querySelector(".deny")){tkLoad();setInterval(()=>{if(!document.hidden&&pgNow!=="tasks"&&pgNow!=="home")tkLoad()},60000)}
/* Home: what each department is doing (for those who publish tasks), or the department's own tasks */
function hmTkUi(){const el=$("#hmTkB");if(!el)return;
 if(!TK.list){el.innerHTML=TK.err?'<div class="msg err" style="margin:0">'+esc(TK.err)+"</div>":'<span class="empty">Loading…</span>';return}
 const now=Date.now(),wk=now-7*864e5;
 if(TK.pub){$("#hmTkH").textContent="Departments";
  const R=TK.depts.map(d=>{const L=TK.list.filter(t=>t.dept===d.id),op=L.filter(t=>t.state!=="done");
   return {d,doing:tkSort(op.filter(t=>t.state==="doing"),"doing"),todo:op.filter(t=>t.state==="todo").length,late:op.filter(t=>tkLate(t,now)).length,done:L.filter(t=>t.state==="done"&&t.done>=wk).length,n:op.length}});
  const gone=TK.list.filter(t=>t.state!=="done"&&!TK.depts.some(d=>d.id===t.dept));
  if(gone.length)R.push({d:{id:"",name:"Roles deleted",n:0},doing:tkSort(gone.filter(t=>t.state==="doing"),"doing"),todo:gone.filter(t=>t.state==="todo").length,late:gone.filter(t=>tkLate(t,now)).length,done:0,n:gone.length,gone:true});
  const max=Math.max(4,...R.map(r=>r.n)),w=k=>(k/max*100).toFixed(2)+"%";
  el.innerHTML='<div class="tk-lg" aria-hidden="true"><span><i class="doing"></i>In progress</span><span><i class="todo"></i>To do</span></div>'+R.map(r=>{
   const name='<button type="button" class="tk-dn" data-hmdept="'+esc(r.d.id)+'"><b>'+esc(r.d.name)+"</b><small>"+(r.gone?"move these to a department":r.d.id==="admin"&&!ROLES_ON?"Everyone, while roles are off":r.d.n?r.d.n+(r.d.n===1?" person":" people"):"No one in this role yet")+"</small></button>";
   const bar='<div class="tk-bar"'+(r.n?' role="img" aria-label="'+esc(r.d.name)+": "+r.doing.length+" in progress, "+r.todo+' to do"':"")+">"+(r.doing.length?'<span class="doing" style="width:'+w(r.doing.length)+'" title="'+r.doing.length+' in progress"></span>':"")+(r.todo?'<span class="todo" style="width:'+w(r.todo)+'" title="'+r.todo+' to do"></span>':"")+"</div>";
   const fig='<div class="tk-fig">'+(r.n?"<span>"+r.doing.length+" in progress · "+r.todo+" to do</span>":'<span class="none">Nothing open</span>')+(r.late?'<span class="tk-late">⚠ '+r.late+" overdue</span>":"")+(r.done?"<small>"+r.done+" done this week</small>":"")+"</div>";
   const now2=r.doing.length?'<div class="tk-now"><span>Now</span>'+r.doing.slice(0,3).map(t=>'<span><button type="button" data-hmtk="'+esc(t.id)+'">'+esc(t.title)+"</button> · "+esc(t.who?tkName(t.who):"not taken")+"</span>").join("")+(r.doing.length>3?"<span>+"+(r.doing.length-3)+" more</span>":"")+"</div>":"";
   return '<div class="tk-dr">'+name+bar+fig+now2+"</div>"}).join("");return}
 $("#hmTkH").textContent=(TK.depts[0]?TK.depts[0].name+" tasks":"Your tasks");
 const L=tkSort(TK.list.filter(t=>t.state!=="done"),"todo").sort((a,b)=>(a.state==="doing"?0:1)-(b.state==="doing"?0:1));
 el.innerHTML=L.length?L.slice(0,8).map(t=>'<button type="button" class="hm-i '+t.state+'" data-hmtk="'+esc(t.id)+'"><i></i><span class="t">'+esc(t.title)+"<small>"+(t.who?esc(tkName(t.who))+(t.who===TK.me?" (you)":""):"Not taken")+(t.due?" · "+(tkLate(t,now)?'<b class="tk-late">Overdue</b> ':"Due ")+esc(tkZ(t.due)):"")+"</small></span><em>"+(t.state==="doing"?"In progress":"To do")+" ›</em></button>").join("")+(L.length>8?'<a class="lk" href="#tasks">'+(L.length-8)+" more in Tasks ›</a>":"")
  :'<p class="empty" style="margin:6px 0">Nothing for your department right now.</p>'}

/* ---------- China AIP data set (CAAC eAIP AIP-DS, AIXM 5.1.1), read in this browser (Nov 2026) ----------
   The zip is opened here, every Baseline file is checked against the SHA-256 in its checksum.xml, and the AIXM is
   reduced to what the EFB uses: R, D, P, TMA, CTA and ADIZ airspace, airways, fixes and navaids, and for each
   airport its runways' declared distances, ILS and approach frequencies. Only that reduced data goes to the server. */
const CNP=(()=>{
 const D2R=Math.PI/180,r5=x=>Math.round(x*1e5)/1e5,r4=x=>Math.round(x*1e4)/1e4;
 /* ---- zip ---- */
 async function unzip(ab){const u=new Uint8Array(ab),dv=new DataView(ab);let e=-1;
  for(let i=u.length-22;i>=Math.max(0,u.length-65558);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break}
  if(e<0)throw new Error("This isn’t a zip file.");
  const n=dv.getUint16(e+10,true),td=new TextDecoder(),L=[];let p=dv.getUint32(e+16,true);
  for(let k=0;k<n;k++){if(dv.getUint32(p,true)!==0x02014b50)throw new Error("The zip’s file list is damaged.");
   const nl=dv.getUint16(p+28,true);L.push({name:td.decode(u.subarray(p+46,p+46+nl)),meth:dv.getUint16(p+10,true),csz:dv.getUint32(p+20,true),lo:dv.getUint32(p+42,true)});p+=46+nl+dv.getUint16(p+30,true)+dv.getUint16(p+32,true)}
  const read=async f=>{const q=f.lo;if(dv.getUint32(q,true)!==0x04034b50)throw new Error(f.name+" is damaged in the zip.");
   const s=q+30+dv.getUint16(q+26,true)+dv.getUint16(q+28,true),raw=u.subarray(s,s+f.csz);if(f.meth===0)return raw.slice();
   if(f.meth!==8)throw new Error(f.name+" uses a compression this browser can’t open.");
   return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer())};
  return{L,read}}
 const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
 const NEED=["AirportHeliport","Airspace","AirTrafficControlService","DesignatedPoint","DME","Glidepath","Localizer","Navaid","NDB","RadioCommunicationChannel","Route","RouteSegment","Runway","RunwayCentrelinePoint","RunwayDirection","Unit","VOR"];
 /* open the zip and check it: returns the data set's details and each Baseline file's text */
 async function open(ab,prog){const z=await unzip(ab),td=new TextDecoder();
  const cs=z.L.find(f=>/(^|\\/)checksum\\.xml$/i.test(f.name));if(!cs)throw new Error("There’s no checksum.xml in this zip. Is it the China AIP data set (AIP-DS)?");
  const ct=td.decode(await z.read(cs)),g=n=>{const m=ct.match(new RegExp("<aisc-ds:"+n+">([^<]*)<"));return m?m[1].trim():""};
  const meta={uid:g("uid"),product:g("product"),issue:g("issueTime"),variant:g("dataVariant"),pub:g("pubNo"),eff:g("effectiveTime"),ver:g("version")};
  if(!/^AIP-DS$/i.test(meta.product)||!/^\\d{6}$/.test(meta.pub)||!Date.parse(meta.eff))throw new Error("checksum.xml doesn’t describe an AIP data set.");
  if(meta.variant&&!/^BASELINE$/i.test(meta.variant))throw new Error("This is a "+meta.variant+" package. Upload the BASELINE one.");
  const sums={};for(const m of ct.matchAll(/<aisc-cs:filename>([^<]+)<\\/aisc-cs:filename>\\s*<aisc-cs:sha256sum>([0-9a-fA-F]{64})</g))sums[m[1].trim()]=m[2].toLowerCase();
  const base=z.L.filter(f=>/^Baseline\\/[^/]+\\.xml$/i.test(f.name)),files={},bad=[],miss=[];
  Object.keys(sums).filter(k=>/^Baseline\\//i.test(k)).forEach(k=>{if(!base.some(f=>f.name===k))miss.push(k.split("/").pop())});
  let i=0;for(const f of base){const b=await z.read(f),h=hex(await crypto.subtle.digest("SHA-256",b));if(sums[f.name]!==h)bad.push(f.name.split("/").pop());
   const k=(f.name.match(/CN_AIP-DS_([A-Za-z]+)_BASELINE/)||[])[1];if(k)files[k]=td.decode(b);if(prog)prog(++i/base.length)}
  if(bad.length)throw new Error("The checksum doesn’t match for "+bad.length+" file"+(bad.length>1?"s":"")+" ("+bad.slice(0,3).join(", ")+(bad.length>3?"…":"")+"). The download may be damaged: download it again.");
  if(miss.length)throw new Error(miss.length+" file"+(miss.length>1?"s":"")+" listed in checksum.xml "+(miss.length>1?"are":"is")+" missing from the zip.");
  const lack=NEED.filter(k=>!files[k]);if(lack.length)throw new Error("The zip has no "+lack.join(", ")+" data.");
  const zs=hex(await crypto.subtle.digest("SHA-256",ab));
  return{meta,files,sha:zs,cycle:meta.pub.slice(2),checked:base.length}}
 /* ---- AIXM, read with patterns: each file holds one feature type, one per message:hasMember ---- */
 const RX=new Map(),rx=(k,s,f)=>{let r=RX.get(k);if(!r){r=new RegExp(s,f||"");RX.set(k,r)}return r};
 const unx=s=>s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/&amp;/g,"&");
 const mem=t=>t?t.split("<message:hasMember>").slice(1):[];
 const raw=(s,n)=>{const m=rx("r"+n,"<aixm:"+n+"(\\\\s[^>]*)?>([^<]*)</aixm:"+n+">").exec(s);return m?{t:unx(m[2].trim()),a:m[1]||""}:null};
 const val=(s,n)=>{const x=raw(s,n);return x&&x.t!==""?x.t:null};
 const num=(s,n)=>{const x=val(s,n);return x==null||!isFinite(+x)?null:+x};
 const uv=(s,n)=>{const x=raw(s,n);if(!x||x.t==="")return null;const u=(x.a.match(/uom="([^"]*)"/)||[])[1]||"";return{t:x.t,v:+x.t,u:u.toUpperCase()}};
 const ref=(s,n)=>{const m=rx("h"+n,"<aixm:"+n+"\\\\s[^>]*?xlink:href=\\"(?:urn:uuid:|#uuid\\\\.|#)?([^\\"]+)\\"").exec(s);return m?m[1]:null};
 const refs=(s,n)=>Array.from(s.matchAll(new RegExp("<aixm:"+n+"\\\\s[^>]*?xlink:href=\\"(?:urn:uuid:|#uuid\\\\.|#)?([^\\"]+)\\"","g")),m=>m[1]);
 const uid=s=>{const m=/<gml:identifier[^>]*>([^<]+)</.exec(s);return m?m[1].trim():null};
 const pos=s=>{const m=/<gml:pos(?:\\s[^>]*)?>([^<]+)<\\/gml:pos>/.exec(s);if(!m)return null;const p=m[1].trim().split(/\\s+/).map(Number);return p.length>=2&&isFinite(p[0])&&isFinite(p[1])&&(p[0]||p[1])?[p[0],p[1]]:null};
 const part=(s,a,b)=>{const i=s.indexOf(a);if(i<0)return"";const j=s.indexOf(b,i);return s.slice(i,j<0?s.length:j)};
 const note=(s,prop)=>{const i=s.indexOf("<aixm:propertyName>"+prop+"</aixm:propertyName>");if(i<0)return"";const m=/<aixm:note[^>]*>([^<]*)<\\/aixm:note>/.exec(s.slice(i,i+3000));return m?unx(m[1].trim()):""};
 const notes=s=>Array.from(s.matchAll(/<aixm:note[^>]*>([^<]*)<\\/aixm:note>/g),m=>unx(m[1].trim())).filter(Boolean);
 const toM=x=>!x?null:x.u==="FT"?x.v*0.3048:x.u==="KM"?x.v*1000:x.u==="NM"?x.v*1852:x.v;
 const mhz=v=>{if(v==null||!isFinite(v))return"";const s=(+v).toFixed(3).replace(/0+$/,"");return s.endsWith(".")?s+"0":s};
 const khz=v=>v==null||!isFinite(v)?"":(+v%1?(+v).toFixed(1):String(+v));
 const fq=x=>!x?"":x.u==="KHZ"?khz(x.v):x.u==="GHZ"?mhz(x.v*1000):mhz(x.v);
 /* a point at a true bearing and distance (km) from another, on the sphere */
 const dest=(p,brg,km)=>{const d=km/6371.0088,b=brg*D2R,f1=p[0]*D2R,l1=p[1]*D2R,f2=Math.asin(Math.sin(f1)*Math.cos(d)+Math.cos(f1)*Math.sin(d)*Math.cos(b)),l2=l1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(f1),Math.cos(d)-Math.sin(f1)*Math.sin(f2));return[f2/D2R,((l2/D2R+540)%360)-180]};
 const km=(a,b)=>{const f1=a[0]*D2R,f2=b[0]*D2R,df=f2-f1,dl=(b[1]-a[1])*D2R,h=Math.sin(df/2)**2+Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;return 12742.0176*Math.asin(Math.min(1,Math.sqrt(h)))};
 const LIM=v=>{if(!v)return"";const t=v[0].toUpperCase();if(/^(GND|SFC|UNL|UNLTD|FLOOR|CEILING)$/.test(t))return t==="UNLTD"?"UNL":t;
  if(v[1]==="FL")return"FL"+t;const n=Math.round(+v[0]),un=v[1]==="FT"?"ft":"m";
  return v[2]==="STD"?(un==="ft"?"FL"+Math.round(n/100):n+"m STD"):v[2]==="SFC"?(n===0?"GND":n+un+" AGL"):n+un};
 function parse(F){
  const st={};const P={},PI={};/* positions and idents of anything a route or an arc can point at, by uuid */
  /* airports */
  const A={},AU={};
  for(const s of mem(F.AirportHeliport)){const id=uid(s),icao=val(s,"locationIndicatorICAO")||val(s,"designator");if(!id||!icao||!/^[A-Z]{4}$/.test(icao))continue;
   const p=pos(part(s,"<aixm:ARP","</aixm:ARP>")),el=uv(s,"fieldElevation"),cy=val(part(s,"<aixm:servedCity","</aixm:servedCity>"),"name");
   A[icao]={i:icao,ia:val(s,"designatorIATA")||"",n:val(s,"name")||"",c:cy||"",p:p?[r5(p[0]),r5(p[1])]:null,el:el?Math.round(toM(el)/0.3048):null,mv:num(s,"magneticVariation"),rw:[],ils:[],fq:[]};
   AU[id]=icao;if(p){P[id]=p;PI[id]=icao}}
  st.apt=Object.keys(A).length;
  /* runways, their two directions and the points along them that carry the declared distances */
  const RW={},RD={};
  for(const s of mem(F.Runway)){const id=uid(s),icao=AU[ref(s,"associatedAirportHeliport")];if(!id||!icao)continue;const ty=val(s,"type");if(ty&&!/^RWY$/i.test(ty))continue;
   const L=uv(s,"nominalLength"),W=uv(s,"nominalWidth"),sp=note(s,"surfaceProperties")||[val(s,"composition"),val(s,"classPCN")!=null?"PCN "+[val(s,"classPCN"),val(s,"pavementTypePCN"),val(s,"pavementSubgradePCN"),val(s,"maxTyrePressurePCN"),val(s,"evaluationMethodPCN")].filter(Boolean).join("/"):""].filter(Boolean).join(" ");
   const sp2=Array.from(new Set(sp.replace(/\\r/g,"").split(/\\n+|;\\s*/).map(x=>x.replace(/^RWY\\s*\\w+\\s*:\\s*/i,"").replace(/\\s+/g," ").trim()).filter(Boolean))).sort((a,b)=>(/^PC[NR]\\b/.test(a)?1:0)-(/^PC[NR]\\b/.test(b)?1:0)).join(" · ");
   const r={d:val(s,"designator")||"",len:L?Math.round(toM(L)):null,wid:W?Math.round(toM(W)):null,sfc:sp2,ends:[]};RW[id]=r;A[icao].rw.push(r)}
  for(const s of mem(F.RunwayDirection)){const id=uid(s),r=RW[ref(s,"usedRunway")];if(!id||!r)continue;const e={d:val(s,"designator")||"",tb:num(s,"trueBearing"),mb:num(s,"magneticBearing"),_p:[]};RD[id]=e;r.ends.push(e)}
  for(const s of mem(F.RunwayCentrelinePoint)){const e=RD[ref(s,"onRunway")];if(!e)continue;const dd={};
   for(const m of s.matchAll(/<aixm:RunwayDeclaredDistance[\\s>][\\s\\S]*?<\\/aixm:RunwayDeclaredDistance>/g)){const t=val(m[0],"type"),v=uv(m[0],"distance");if(t&&v)dd[t.toUpperCase()]=Math.round(toM(v))}
   e._p.push({role:val(s,"role")||"",dd,p:pos(s),rm:notes(s).join("; ")})}
  let nrw=0;Object.values(RW).forEach(r=>{nrw++;r.ends.sort((a,b)=>a.d.localeCompare(b.d,"en",{numeric:true}));r.ends.forEach(e=>{const pts=e._p;delete e._p;
   const withT=pts.filter(x=>x.dd.TORA!=null).sort((a,b)=>b.dd.TORA-a.dd.TORA),main=withT[0]||pts.find(x=>/THR/.test(x.role))||pts[0];
   const mx=k=>{let v=null;pts.forEach(x=>{if(x.dd[k]!=null&&(v==null||x.dd[k]>v))v=x.dd[k]});return v};
   if(main){e.tora=main.dd.TORA!=null?main.dd.TORA:null;e.toda=main.dd.TODA!=null?main.dd.TODA:null;e.asda=main.dd.ASDA!=null?main.dd.ASDA:null;if(main.rm)e.rm=main.rm}
   e.lda=mx("LDA");const dt=mx("DTHR");if(dt)e.dthr=dt;
   const th=pts.find(x=>/^THR$/.test(x.role)&&x.p)||pts.find(x=>/THR/.test(x.role)&&x.p);if(th)e.thr=[r5(th.p[0]),r5(th.p[1])];
   const ix=withT.slice(1).filter(x=>e.tora!=null&&x.dd.TORA<e.tora).map(x=>({rm:x.rm||"",tora:x.dd.TORA,toda:x.dd.TODA!=null?x.dd.TODA:null,asda:x.dd.ASDA!=null?x.dd.ASDA:null}));if(ix.length)e.ix=ix;
   if(e.mb==null)delete e.mb})});
  st.rwy=nrw;
  /* navaids: the parts first (VOR, DME, NDB, localizer, glide path), then the systems that group them */
  const C={};
  const comp=(t,k)=>{for(const s of mem(F[t])){const id=uid(s);if(!id)continue;C[id]={k,i:val(s,"designator")||"",n:val(s,"name")||"",f:fq(uv(s,"frequency")),ch:val(s,"channel")||"",p:pos(s),mb:num(s,"magneticBearing"),tb:num(s,"trueBearing"),sl:num(s,"slope"),rm:notes(s).join("; ")}}};
  comp("VOR","VOR");comp("DME","DME");comp("NDB","NDB");comp("Localizer","LOC");comp("Glidepath","GP");
  const NAV=[],ILS=new Set(["ILS","ILS_DME","LOC","LOC_DME","LDA","LDA_DME","SDF","MLS","MLS_DME"]);let nils=0;
  for(const s of mem(F.Navaid)){const id=uid(s);if(!id)continue;const ty=(val(s,"type")||"").toUpperCase(),parts=refs(s,"theNavaidEquipment").map(r=>C[r]).filter(Boolean);
   const p=pos(part(s,"<aixm:location","</aixm:location>"))||((parts.find(x=>x.k==="VOR"&&x.p)||parts.find(x=>x.k==="NDB"&&x.p)||parts.find(x=>x.p)||{}).p)||null;
   const ident=val(s,"designator")||(parts.find(x=>x.i)||{}).i||"",name=val(s,"name")||(parts.find(x=>x.n)||{}).n||"";
   if(p){P[id]=p;PI[id]=ident}
   if(ILS.has(ty)){const icao=AU[ref(s,"servedAirport")],loc=parts.find(x=>x.k==="LOC"),gp=parts.find(x=>x.k==="GP"),dme=parts.find(x=>x.k==="DME");if(!icao||!loc)continue;
    const rw=((loc.n||"").match(/(\\d{2}[LRC]?)\\s*$/)||[])[1]||"";
    A[icao].ils.push({rw,id:loc.i||ident,f:loc.f,t:ty.replace(/_/g,"/"),cat:name,gp:gp?(gp.sl||null):null,gpf:gp?gp.f:"",dme:dme?dme.ch:"",mb:loc.mb});nils++;continue}
   if(!p||!/VOR|NDB|DME|TACAN/.test(ty))continue;
   const v=parts.find(x=>x.k==="VOR"),n=parts.find(x=>x.k==="NDB"),d=parts.find(x=>x.k==="DME");
   NAV.push({id,i:ident,n:name,k:/VOR/.test(ty)?(d?"VOR/DME":"VOR"):/NDB/.test(ty)?(d?"NDB/DME":"NDB"):ty,p,f:v?v.f:n?n.f:"",ch:d?d.ch:""})}
  st.nav=NAV.length;st.ils=nils;
  /* ILS course: the localizer's own magnetic bearing, else the runway's true bearing less the airport's variation */
  Object.values(A).forEach(a=>{a.ils.forEach(x=>{const e=[].concat(...a.rw.map(r=>r.ends)).find(e=>e.d===x.rw);let c=x.mb;
   if(c==null&&e)c=e.mb!=null?e.mb:e.tb!=null&&a.mv!=null?e.tb-a.mv:null;x.crs=c==null?null:Math.round(((c%360)+360)%360)||360;delete x.mb});
   a.ils.sort((p,q)=>p.rw.localeCompare(q.rw,"en",{numeric:true}))});
  /* fixes */
  const FIX=[];for(const s of mem(F.DesignatedPoint)){const id=uid(s),p=pos(s),i=val(s,"designator");if(!id||!p||!i)continue;P[id]=p;PI[id]=i;FIX.push({id,i,p,ty:val(s,"type")||""})}
  st.fix=FIX.length;
  /* airways: each segment between two points, with its route's name */
  const RT={};for(const s of mem(F.Route)){const id=uid(s);if(!id)continue;RT[id]=[val(s,"designatorPrefix"),val(s,"designatorSecondLetter"),val(s,"designatorNumber"),val(s,"multipleIdentifier")].filter(Boolean).join("")}
  const SEG=[],COMP=new Set();let nos=0;
  for(const s of mem(F.RouteSegment)){const a=part(s,"<aixm:start>","</aixm:start>"),b=part(s,"<aixm:end>","</aixm:end>");
   const pt=x=>ref(x,"pointChoice_fixDesignatedPoint")||ref(x,"pointChoice_navaidSystem")||ref(x,"pointChoice_aimingPoint")||ref(x,"pointChoice_airportReferencePoint")||ref(x,"pointChoice_runwayPoint");
   const pa=pt(a),pb=pt(b);if(!pa||!pb||!P[pa]||!P[pb]){nos++;continue}
   const ca=val(a,"reportingATC")==="COMPULSORY",cb=val(b,"reportingATC")==="COMPULSORY";if(ca)COMP.add(pa);if(cb)COMP.add(pb);
   const L=uv(s,"length"),mfa=(notes(s).join(" ").match(/minimum flight altitude\\s*:?\\s*(\\d+)\\s*m/i)||[])[1];
   const mea=uv(s,"minimumEnrouteAltitude");
   SEG.push({w:RT[ref(s,"routeFormed")]||"",a:pa,b:pb,len:L?Math.round(toM(L)/1852):Math.round(km(P[pa],P[pb])/1.852),trk:num(s,"magneticTrack"),rtrk:num(s,"reverseMagneticTrack"),
    mea:mea?Math.round(toM(mea))+"m":mfa?mfa+"m":"",dir:val(s,"direction")||""})}
  st.seg=SEG.length;st.segSkip=nos;
  /* approach units and their frequencies */
  const RC={};for(const s of mem(F.RadioCommunicationChannel)){const id=uid(s);if(!id)continue;RC[id]={f:fq(uv(s,"frequencyTransmission")||uv(s,"frequencyReception")),r:val(s,"rank")||""}}
  const UN={};for(const s of mem(F.Unit)){const id=uid(s);if(!id)continue;UN[id]={n:val(s,"name")||"",t:val(s,"type")||"",apt:AU[ref(s,"airportLocation")]||null}}
  const SV=[];for(const s of mem(F.AirTrafficControlService)){const fr=refs(s,"radioCommunication").map(r=>RC[r]).filter(x=>x&&x.f);if(!fr.length)continue;
   fr.sort((a,b)=>(a.r==="PRIMARY"?0:1)-(b.r==="PRIMARY"?0:1));SV.push({cs:val(s,"callSign")||"",t:val(s,"type")||"",u:UN[ref(s,"serviceProvider")]||null,asp:refs(s,"clientAirspace"),f:Array.from(new Set(fr.map(x=>x.f)))})}
  /* airspace: R, D, P, TMA, CTA and ADIZ; arcs and circles become points every 3 degrees */
  const KEEP={R:"R",D:"D",P:"P",TMA:"TMA",CTA:"CTA",ADIZ:"ADIZ",CTR:"CTR"},AS={},FEAT=[];let nog=0,arcs=0,arcFlip=0;
  for(const s of mem(F.Airspace)){const id=uid(s),ty=(val(s,"type")||"").toUpperCase();if(!id)continue;AS[id]={t:ty,d:val(s,"designator")||"",n:val(s,"name")||""};
   if(!KEEP[ty]){if(ty==="SECTOR"){const hp=part(s,"<aixm:horizontalProjection","</aixm:horizontalProjection>");AS[id].hp=hp?part(hp,"<gml:exterior","</gml:exterior>"):""}continue}const vols=s.split("<aixm:AirspaceVolume").slice(1);let got=0;
   vols.forEach(v=>{const lim=k=>{const x=raw(v,k);if(!x||x.t==="")return null;return[x.t,((x.a.match(/uom="([^"]*)"/)||[])[1]||"").toUpperCase(),(val(v,k+"Reference")||"").toUpperCase()]};
    const hp=part(v,"<aixm:horizontalProjection","</aixm:horizontalProjection>");if(!hp)return;
    const rings=[part(hp,"<gml:exterior","</gml:exterior>")].concat(hp.split("<gml:interior").slice(1)).map(rg=>ringOf(rg)).filter(r=>r&&r.length>=4);if(!rings.length)return;
    got++;const lo=lim("lowerLimit"),hi=lim("upperLimit");
    if(!AS[id].g)AS[id].g=rings[0];
    FEAT.push({id,t:ty,d:AS[id].d,n:AS[id].n,lo:LIM(lo),hi:LIM(hi),g:rings.map(r=>r.map(p=>[r4(p[1]),r4(p[0])]))})});
   if(!got)nog++}
  function ringOf(rg){if(!rg)return null;const out=[],segs=Array.from(rg.matchAll(/<gml:(GeodesicString|LineStringSegment|Geodesic|ArcByCenterPoint|CircleByCenterPoint|ArcString)[\\s>][\\s\\S]*?<\\/gml:\\1>/g));
   const ptsOf=x=>{const pl=/<gml:posList[^>]*>([^<]+)<\\/gml:posList>/.exec(x);if(pl){const n=pl[1].trim().split(/\\s+/).map(Number),o=[];for(let i=0;i+1<n.length;i+=2)o.push([n[i],n[i+1]]);return o}
    return Array.from(x.matchAll(/<gml:pos(?:\\s[^>]*)?>([^<]+)<\\/gml:pos>/g),m=>m[1].trim().split(/\\s+/).map(Number)).filter(p=>p.length>=2)};
   const ctr=x=>{const p=pos(x);if(p)return p;const m=/<gml:pointProperty\\s[^>]*?xlink:href="(?:urn:uuid:|#uuid\\.|#)?([^"]+)"/.exec(x);return m&&P[m[1]]?P[m[1]]:null};
   const rad=x=>{const m=/<gml:radius(?:\\s+uom="([^"]*)")?[^>]*>([^<]+)<\\/gml:radius>/.exec(x);if(!m)return null;const u=(m[1]||"KM").toUpperCase(),v=+m[2];return u==="NM"||u==="[NMI_I]"?v*1.852:u==="M"?v/1000:u==="FT"?v*0.0003048:v};
   const ang=(x,n)=>{const m=rx("g"+n,"<gml:"+n+"[^>]*>([^<]+)</gml:"+n+">").exec(x);return m?+m[1]:null};
   for(let k=0;k<segs.length;k++){const [x,kind]=segs[k];
    if(kind==="CircleByCenterPoint"){const c=ctr(x),r=rad(x);if(!c||!r)return null;for(let b=0;b<=360;b+=3)out.push(dest(c,b,r));continue}
    if(kind==="ArcByCenterPoint"){const c=ctr(x),r=rad(x),a0=ang(x,"startAngle"),a1=ang(x,"endAngle");if(!c||!r||a0==null||a1==null)return null;arcs++;
     /* the angles read as bearings (from north, clockwise); if that puts the arc's ends away from its neighbours, read them as GML's own (from east, anticlockwise) */
     const mk=f=>{const sw=f(a1)-f(a0),n=Math.max(2,Math.ceil(Math.abs(sw)/3)),o=[];for(let i=0;i<=n;i++)o.push(dest(c,f(a0)+sw*i/n,r));return o};
     const A1=mk(a=>a),A2=mk(a=>90-a),prev=out.length?out[out.length-1]:null,nx=k+1<segs.length?ptsOf(segs[k+1][0])[0]:null;
     const err=o=>(prev?km(prev,o[0]):0)+(nx?km(nx,o[o.length-1]):0);let o=A1;if((prev||nx)&&err(A2)+0.05<err(A1)){o=A2;arcFlip++}
     out.push(...o);continue}
    out.push(...ptsOf(x))}
   if(out.length<3)return null;const f=out[0],l=out[out.length-1];if(km(f,l)>0.01)out.push([f[0],f[1]]);
   /* drop points closer than 30 m to the one before */
   const o2=[out[0]];for(let i=1;i<out.length;i++)if(km(o2[o2.length-1],out[i])>0.03||i===out.length-1)o2.push(out[i]);return o2}
  st.asp=FEAT.length;st.aspNoGeo=nog;st.arcs=arcs;st.arcFlip=arcFlip;
  /* frequencies: for each airspace, and for each airport its approach (the unit at the airport, or the TMA named for it) */
  const fqAsp={};SV.forEach(v=>v.asp.forEach(a=>{(fqAsp[a]=fqAsp[a]||[]).push({n:v.cs||(v.u&&v.u.n)||"",f:v.f})}));
  FEAT.forEach(f=>{const x=fqAsp[f.id];if(x)f.fq=x.slice(0,4)});
  /* an airport's approach: the approach units whose sectors are named for it (ZGGGAP01…), else those whose sectors
     cover it (Pudong under Shanghai's); each with its sector names (AP01) and frequencies, main one first */
  const APPR=/APPROACH|DEPARTURE|ARRIVAL|DIRECTOR|TERMINAL/i,ap=SV.filter(v=>v.cs&&APPR.test(v.cs));
  const inside=(p,r)=>{let n=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[0]>p[0])!==(b[0]>p[0])&&p[1]<(b[1]-a[1])*(p[0]-a[0])/(b[0]-a[0])+a[1])n=!n}return n};
  const geo=x=>{const a=AS[x];if(!a)return null;if(a.g===undefined)a.g=a.hp?ringOf(a.hp):null;return a.g};
  const sect=v=>{const ds=v.asp.map(x=>AS[x]&&AS[x].d||"").filter(Boolean).map(d=>d.replace(/^[A-Z]{4}/,""));if(!ds.length)return"";
   let p=ds.reduce((p,q)=>{let i=0;while(i<p.length&&p[i]===q[i])i++;return p.slice(0,i)});p=p.replace(/[^A-Z0-9]+$/,"");return p.length>=4?p:""};
  Object.values(A).forEach(a=>{let L=ap.filter(v=>v.asp.some(x=>AS[x]&&AS[x].d.startsWith(a.i)));
   if(!L.length&&a.p)L=ap.filter(v=>v.asp.some(x=>{const g=geo(x);return g&&inside(a.p,g)}));
   const seen=new Set();a.fq=L.map(v=>({n:v.cs,s:sect(v),f:v.f})).filter(x=>{const k=x.n+x.s+x.f.join();if(seen.has(k))return false;seen.add(k);return true})
    .sort((p,q)=>p.n.localeCompare(q.n)||p.s.localeCompare(q.s,"en",{numeric:true}))});
  st.aptFq=Object.values(A).filter(a=>a.fq.length).length;
  /* compact rows for the map */
  const nav=NAV.map(n=>[n.i,n.n,n.k,r5(n.p[0]),r5(n.p[1]),n.f,n.ch]),fix=FIX.map(f=>[f.i,r5(f.p[0]),r5(f.p[1]),COMP.has(f.id)?1:0]);
  const seg=SEG.map(g=>[g.w,PI[g.a]||"",r5(P[g.a][0]),r5(P[g.a][1]),PI[g.b]||"",r5(P[g.b][0]),r5(P[g.b][1]),g.len,g.trk,g.rtrk,g.mea,COMP.has(g.a)?1:0,COMP.has(g.b)?1:0,g.dir]);
  const asp=FEAT.map(f=>({type:"Feature",properties:{t:f.t,d:f.d,n:f.n,lo:f.lo,hi:f.hi,fq:f.fq?f.fq.map(x=>x.n+" "+x.f.join(" ")).join(" · "):""},geometry:{type:"Polygon",coordinates:f.g}}));
  return{apt:A,nav,fix,seg,asp:{type:"FeatureCollection",features:asp},st}}
 /* the airways, fixes and navaids cut into the EFB's 8-degree IFR cells, rows the way the IFR map reads them */
 function cells(d){const C={},key=(la,lo)=>(Math.floor(la/8)*8)+","+(Math.floor(lo/8)*8),get=k=>C[k]||(C[k]={routes:[],fixes:[],navs:[]});
  const RN=/^[LMNPQTYZ]\\d/;
  d.seg.forEach((g,i)=>{const la0=Math.min(g[2],g[5]),la1=Math.max(g[2],g[5]),lo0=Math.min(g[3],g[6]),lo1=Math.max(g[3],g[6]);
   const row=["cn"+i,g[0],RN.test(g[0])?"RNAV":"",g[10]||null,null,null,g[8],g[9],g[7],[[[g[3],g[2]],[g[6],g[5]]]]];
   for(let la=Math.floor(la0/8)*8;la<=la1;la+=8)for(let lo=Math.floor(lo0/8)*8;lo<=lo1;lo+=8)get(la+","+lo).routes.push(row)});
  d.fix.forEach((f,i)=>get(key(f[1],f[2])).fixes.push(["cf"+i,f[0],f[2],f[1],f[3]]));
  d.nav.forEach((n,i)=>get(key(n[3],n[4])).navs.push(["cv"+i,n[0],n[1],n[2],n[4],n[3],n[5]]));
  return C}
 return{open,parse,cells,unzip}})();
/* ---------- AIP Japan map data (JCAB SWIM portal › AIP File Download › 3_AIP(Shapefile, KML)), read in this browser
   (Nov 2026). The zip holds one KML_yyyymmdd folder per AIRAC (the one in force and the next); each is reduced to what
   the EFB draws: airways (ATS, RNAV, direct and oceanic transition routes), reporting points and waypoints, navaids, and
   restricted, approach control, control and information zone, training and corridor airspace and the ADIZ. Only that
   goes to the server, one AIRAC at a time (POST /admin/api/navdata/jp). */
const JPP=(()=>{
 const r4=x=>Math.round(x*1e4)/1e4,r5=x=>Math.round(x*1e5)/1e5;
 const unx=s=>String(s).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/&amp;/g,"&").replace(/[\\s　]+/g," ").trim();
 /* 20261126 -> AIRAC "2612" (28-day cycles counted from AIRAC 2601, 22 Jan 2026) */
 const E0=Date.UTC(2026,0,22),CY=28*864e5;
 const airac=ymd=>{const t=Date.UTC(+ymd.slice(0,4),+ymd.slice(4,6)-1,+ymd.slice(6,8)),n=Math.floor((t-E0)/CY),f=E0+n*CY,yr=new Date(f).getUTCFullYear(),first=E0+Math.ceil((Date.UTC(yr,0,1)-E0)/CY)*CY;
  return{pub:String(yr)+String(Math.round((f-first)/CY)+1).padStart(2,"0"),eff:new Date(t).toISOString()}};
 async function open(ab,prog){const z=await CNP.unzip(ab),td=new TextDecoder(),C={};
  for(const f of z.L){const m=f.name.match(/(?:^|\\/)KML_(\\d{8})\\/([^/]+?)_EFF(\\d{8})\\.kml$/i);if(!m)continue;(C[m[1]]=C[m[1]]||{})[m[2]]=f}
  const dates=Object.keys(C).sort();if(!dates.length)throw new Error("There’s no KML_yyyymmdd folder in this zip. Is it 3_AIP(Shapefile, KML) from the SWIM portal?");
  const out=[];let i=0,n=dates.reduce((s,d)=>s+Object.keys(C[d]).length,0);
  for(const d of dates){const files={};for(const[k,f]of Object.entries(C[d])){files[k]=td.decode(await z.read(f));if(prog)prog(++i/n)}
   if(!files.RNAV_ROUTES||!files.REP_WPT)throw new Error("KML_"+d+" has no RNAV_ROUTES or REP_WPT file.");out.push({date:d,...airac(d),files})}
  return out}
 const pms=t=>t?t.match(/<Placemark[\\s\\S]*?<\\/Placemark>/g)||[]:[];
 const attrs=p=>{const a={};for(const m of p.matchAll(/<td>([A-Z][A-Z0-9_-]*)<\\/td>\\s*<td>([^<]*)<\\/td>/g))if(!(m[1] in a))a[m[1]]=unx(m[2]);return a};
 const coords=s=>s.trim().split(/\\s+/).map(c=>c.split(",").map(Number)).filter(c=>c.length>=2&&isFinite(c[0])&&isFinite(c[1])).map(c=>[c[0],c[1]]);
 /* Douglas-Peucker in degrees: lines and outlines drawn on a map need far fewer points than the data has */
 function dp(P,tol){if(P.length<3)return P.slice();const keep=new Uint8Array(P.length);keep[0]=keep[P.length-1]=1;const st=[[0,P.length-1]];
  while(st.length){const[a,b]=st.pop();let mx=0,ix=-1;const[x1,y1]=P[a],[x2,y2]=P[b],dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy;
   for(let i=a+1;i<b;i++){const[x,y]=P[i];let t=L?((x-x1)*dx+(y-y1)*dy)/L:0;t=t<0?0:t>1?1:t;const ex=x1+t*dx-x,ey=y1+t*dy-y,d=ex*ex+ey*ey;if(d>mx){mx=d;ix=i}}
   if(ix>0&&mx>tol*tol){keep[ix]=1;st.push([a,ix],[ix,b])}}
  return P.filter((p,i)=>keep[i])}
 const lines=p=>Array.from(p.matchAll(/<LineString>[\\s\\S]*?<coordinates>([\\s\\S]*?)<\\/coordinates>/g),m=>dp(coords(m[1]),0.003).map(c=>[r4(c[0]),r4(c[1])])).filter(l=>l.length>=2);
 const polys=p=>Array.from(p.matchAll(/<Polygon>([\\s\\S]*?)<\\/Polygon>/g),m=>{const rings=[];const o=m[1].match(/<outerBoundaryIs>[\\s\\S]*?<coordinates>([\\s\\S]*?)<\\/coordinates>/);if(!o)return null;rings.push(o[1]);
  for(const q of m[1].matchAll(/<innerBoundaryIs>[\\s\\S]*?<coordinates>([\\s\\S]*?)<\\/coordinates>/g))rings.push(q[1]);
  return rings.map(r=>{let c=dp(coords(r),0.0006).map(c=>[r4(c[0]),r4(c[1])]);if(c.length&&(c[0][0]!==c[c.length-1][0]||c[0][1]!==c[c.length-1][1]))c.push(c[0].slice());return c}).filter(r=>r.length>=4)}).filter(r=>r&&r.length);
 const pt=p=>{const m=p.match(/<Point>[\\s\\S]*?<coordinates>([\\s\\S]*?)<\\/coordinates>/);const c=m&&coords(m[1])[0];return c||null};
 const lim=v=>{v=String(v||"").trim().toUpperCase();if(!v||v==="-")return"";const f=v.match(/^(\\d+)\\s*FT$/);if(f)return f[1]+"ft";const fl=v.match(/^FL\\s*(\\d+)$/);if(fl)return"FL"+fl[1];return v.replace(/\\s+/g," ")};
 const mea=v=>{v=String(v||"").trim().toUpperCase();const f=v.match(/^(\\d+)\\s*FT$/);return f?f[1]:v||null};
 const num=v=>v===""||v==null||!isFinite(+v)?null:+v;
 function parse(F){const st={apt:0},R=[],FX=[],NV=[],A=[];
  /* airways: one placemark per leg */
  [["ATS_ROUTES",""],["RNAV_ROUTES","RNAV"],["Direct_routes","DCT"],["Oceanic_Transition_routes","OTR"]].forEach(([k,ty])=>pms(F[k]).forEach(p=>{const a=attrs(p),L=lines(p);if(!L.length)return;
   const t=/RNAV/i.test(a.TYPE||"")||ty==="RNAV"?"RNAV":ty==="DCT"?"DCT":"";R.push({w:ty==="DCT"?"":(a.DESIGNATOR||""),t,mea:mea(a.MEA),trk:num(a.MAG_TR),rtrk:num(a.R_MAG_TR),len:num(a.DIST)!=null?Math.round(+a.DIST):null,L})}));
  pms(F.REP_WPT).forEach(p=>{const a=attrs(p),c=pt(p),i=a.NAME_CODE||a["NAME-CODE"]||"";if(!c||!i)return;FX.push([i,r5(c[1]),r5(c[0]),/Compulsory/i.test(a.TYPE||"")&&!/Non-compulsory/i.test(a.TYPE||"")?1:0])});
  pms(F.RADIO_NAVIGATION_AIDS).forEach(p=>{const a=attrs(p),c=pt(p);if(!c||!a.ID)return;NV.push([a.ID,a.NAME||"",(a.TYPE||"").replace(/\\s*\\(Compulsory\\)/i,""),r5(c[1]),r5(c[0]),a.FREQ||"",a.CH||""])});
  /* airspace */
  const add=(t,n,a,p)=>polys(p).forEach(g=>A.push({type:"Feature",properties:{t,d:"",n:unx(n||""),lo:lim(a.ALT_LOWER),hi:lim(a.ALT_UPPER),fq:""},geometry:{type:"Polygon",coordinates:g}}));
  pms(F.Restricted_area_Airspace_restrictions).forEach(p=>{const a=attrs(p);add("R",a.ID_NAME||a.AREA,a,p)});
  ["Approach_control_area_CIVIL","Approach_control_area_MIL"].forEach(k=>pms(F[k]).forEach(p=>{const a=attrs(p);add("TMA",(a.NAME||"")+" APP",a,p)}));
  pms(F.Control_zone_and_Information_zone).forEach(p=>{const a=attrs(p),n=a.NAME||"";add(/\\bCTR$/i.test(n)?"CTR":"IZ",n,a,p)});
  ["Civil_training_and_testing_areas","JSDF_training_and_testing_areas_HIGH","JSDF_training_and_testing_areas_LOW"].forEach(k=>pms(F[k]).forEach(p=>{const a=attrs(p);add("TRN",a.NAME2&&a.NAME2!==a.NAME1?a.NAME2:(a.NAME1||a.NAME||a.AREA),a,p)}));
  pms(F.Corridors).forEach(p=>{const a=attrs(p);add("COR",(a.NAME||"")+" CORRIDOR",a,p)});
  ["ADIZ_INNER","ADIZ_OUTER"].forEach(k=>pms(F[k]).forEach(p=>add("ADIZ","JAPAN ADIZ",{},p)));
  st.seg=R.length;st.fix=FX.length;st.nav=NV.length;st.asp=A.length;
  return{R,FX,NV,asp:{type:"FeatureCollection",features:A},st,apt:{}}}
 /* the IFR map's rows, cut into 8-degree cells; ids start with j so they never meet China's or the FAA's */
 function cells(d){const C={},get=k=>C[k]||(C[k]={routes:[],fixes:[],navs:[]}),key=(la,lo)=>(Math.floor(la/8)*8)+","+(Math.floor(lo/8)*8);
  d.R.forEach((r,i)=>{let x0=999,x1=-999,y0=999,y1=-999;r.L.forEach(l=>l.forEach(p=>{if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]}));
   const row=["jr"+i,r.w,r.t==="RNAV"?"RNAV":r.t,r.mea,null,null,r.trk,r.rtrk,r.len,r.L];
   for(let la=Math.floor(y0/8)*8;la<=y1;la+=8)for(let lo=Math.floor(x0/8)*8;lo<=x1;lo+=8)get(la+","+lo).routes.push(row)});
  d.FX.forEach((f,i)=>get(key(f[1],f[2])).fixes.push(["jf"+i,f[0],f[2],f[1],f[3]]));
  d.NV.forEach((n,i)=>get(key(n[3],n[4])).navs.push(["jv"+i,n[0],n[1],n[2],n[4],n[3],n[5]]));
  return C}
 return{open,parse,cells}})();
/* ---------- Nav Data: each region's navigation data and whether it is current (Nov 2026, see navdata.js on the server) ---------- */
const ND={busy:""};
const ndDay=t=>new Date(t).toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"});
const ndIn=(t,now)=>{const d=Math.ceil((t-now)/864e5);return d<=0?"today":d===1?"tomorrow":"in "+d+" days"};
const ndCnt=v=>{const L=(v&&v.src)||[];return{bad:L.filter(s=>s.state==="bad").length,warn:L.filter(s=>s.state==="warn").length,ok:L.filter(s=>s.state==="ok").length,off:L.filter(s=>s.state==="off").length}};
/* the sidebar's count: sources to look at */
function ndBadge(v){const n=$("#ndN");if(!n||!v)return;const c=ndCnt(v),k=c.bad+c.warn;n.hidden=!k;n.textContent=k||"";n.classList.toggle("red",!!c.bad)}
/* the list is drawn again only when what it shows has changed (the minute's reload of the same answer leaves it, and
   whatever is open or focused in it, alone) */
const ndSet=(sel,h)=>{const el=$(sel);if(el&&el.__h!==h){el.__h=h;el.innerHTML=h}};
function ndUi(){const v=opsV("nav"),o=OPS.nav;
 if(!v){ndSet("#ndList",'<section>'+(o&&o.err?'<div class="msg err">'+esc(o.err)+"</div>":'<span class="empty">Loading…</span>')+"</section>");return}
 const now=v.now||Date.now(),cur=v.airac.cur,nx=v.airac.next,c=ndCnt(v);ndBadge(v);
 $("#ndCyc").innerHTML='<div><span>AIRAC in force</span><b>'+esc(cur.cycle)+'</b><small>'+ndDay(Date.parse(cur.from))+" – "+ndDay(Date.parse(cur.to))+'</small></div><div><span>Next</span><b>'+esc(nx.cycle)+"</b><small>from "+ndDay(Date.parse(nx.from))+" "+new Date(nx.from).toISOString().slice(11,16)+"Z · "+ndIn(Date.parse(nx.from),now)+'</small></div><div><span>Checked</span><b>'+(v.at?akZ(v.at):"–")+"</b><small>"+(v.at?ndDay(v.at)+" · every 6 h":"not yet")+"</small></div>";
 ndRmUi(v);
 $("#ndSum").innerHTML=[c.ok?'<i class="ok">'+c.ok+" current</i>":"",c.warn?'<i class="warn">'+c.warn+" to look at</i>":"",c.bad?'<i class="bad">'+c.bad+" not working</i>":"",c.off?'<i class="off">'+c.off+" not set up</i>":""].join("");
 const chk=ndChk(v),lbl={ok:"Current",warn:"Look at",bad:"Not working",off:"Not set up"};ndTabsUi(v);
 const secs=ndSections(v);
 ndSet("#ndList",(secs.length?"":'<section><p class="nd-none">'+(ND.q?"Nothing matches “"+esc(ND.q)+"”.":ND.tab==="attn"?"Nothing needs attention: every source is current.":"Nothing here.")+"</p></section>")
  +secs.map(r=>'<section class="nd-reg'+(r.attn?" attn":"")+'"><h3>'+esc(r.n)+"<small>"+r.L.length+"</small></h3>"+'<div class="nd-grid">'+r.L.map(s=>'<article class="nd-c '+s.state+(ND.run&&ND.run.cur.includes(s.id)?" chkg":"")+'" id="nd-'+esc(s.id)+'"><div class="nd-h"><b>'+(s.region==="Worldwide"?esc(s.name):'<span class="nd-cty">'+esc(s.region)+"</span><br>"+esc(s.name))+'</b><span class="nd-st '+s.state+'">'+lbl[s.state]+"</span></div>"
   +'<div class="nd-by">'+(s.link?'<a href="'+esc(s.link)+'" target="_blank" rel="noopener">'+esc(s.by)+" ↗</a>":esc(s.by))+"</div>"
   +'<p class="nd-line">'+esc(s.line)+"</p>"+(s.rows.length?'<dl class="nd-rows">'+s.rows.map(x=>"<dt>"+esc(x[0])+"</dt><dd>"+esc(x[1])+"</dd>").join("")+"</dl>":"")
   +(s.id==="cn-aip"?ndAipHtml(s,"cn"):s.id==="jp-aip"?ndAipHtml(s,"jp"):s.id==="jp-charts"?ndJcHtml(s,"jpc"):s.id==="cn-charts"?ndJcHtml(s,"cnc"):"")+'<p class="nd-what">'+esc(s.what)+'</p><div class="nd-f"><small>'+esc(s.how)+(s.at&&chk.has(s.id)?" · checked "+ndDay(s.at)+" "+akZ(s.at):"")+"</small>"
   +(chk.has(s.id)?'<button type="button" data-ndchk="'+esc(s.id)+'"'+(ND.busy?" disabled":"")+">"+ndBtnTxt(s.id)+"</button>":"")+"</div></article>").join("")+"</div></section>").join(""));
 ndProgUi(v);ndAllBtn()}
/* the tabs: what needs attention, everything, or one part of the world; and a search by country or source */
const ND_AREAS=["Asia and Pacific","Europe","Americas","Worldwide"];
const ndArea=s=>s.area||(/^us-/.test(s.id)?"Americas":/^(tw|cn|jp)-|^ea-(hk|sg|my|kr)$/.test(s.id)?"Asia and Pacific":/^ea-/.test(s.id)?"Europe":"Worldwide");
const ndAttn=s=>s.state==="bad"||s.state==="warn";
const ndRank=s=>s.state==="bad"?0:s.state==="warn"?1:2;
try{ND.tab=localStorage.getItem("ndTab")||"all"}catch(e){ND.tab="all"}ND.q="";
const ndMatch=s=>{const q=ND.q.trim().toLowerCase();return !q||[s.region,s.name,s.by,s.id,ndArea(s)].some(x=>String(x||"").toLowerCase().includes(q))};
function ndSections(v){const L=v.src.filter(ndMatch),T=ND_AREAS.includes(ND.tab)||ND.tab==="attn"?ND.tab:"all",bad=L.filter(ndAttn).sort((a,b)=>ndRank(a)-ndRank(b));
 if(T==="attn")return bad.length?[{n:"Needs attention",attn:true,L:bad}]:[];
 if(T!=="all"){const A=L.filter(s=>ndArea(s)===T).sort((a,b)=>ndRank(a)-ndRank(b));return A.length?[{n:T,L:A}]:[]}
 return [...(bad.length?[{n:"Needs attention",attn:true,L:bad}]:[]),...ND_AREAS.map(n=>({n,L:L.filter(s=>ndArea(s)===n&&!ndAttn(s))})).filter(r=>r.L.length)]}
function ndTabsUi(v){const el=$("#ndTabs");if(!el)return;const n=v.src.filter(ndAttn).length;
 const T=[["attn","Needs attention",n],["all","All",v.src.length],...ND_AREAS.map(a=>[a,a,v.src.filter(s=>ndArea(s)===a).length])].filter(t=>t[2]||t[0]==="attn"||t[0]==="all");
 const cur=T.some(t=>t[0]===ND.tab)?ND.tab:"all";
 el.innerHTML=T.map(([k,l,c])=>{const b=k!=="attn"&&k!=="all"?v.src.filter(s=>ndArea(s)===k&&ndAttn(s)).length:0;
  return '<button type="button" role="tab" data-ndtab="'+esc(k)+'"'+(k==="attn"&&n?' class="attn"':"")+' aria-selected="'+(k===cur)+'">'+esc(l)+" <i>"+c+"</i>"+(b?'<b title="'+b+' need attention">'+b+"</b>":"")+"</button>"}).join("")}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-ndtab]");if(!b)return;ND.tab=b.dataset.ndtab;try{localStorage.setItem("ndTab",ND.tab)}catch(x){}ndUi();ndAllBtn()});
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("#ndSum i.bad,#ndSum i.warn");if(!b)return;ND.tab="attn";try{localStorage.setItem("ndTab","attn")}catch(x){}ndUi();ndAllBtn()});
let ndQT=0;document.addEventListener("input",e=>{if(!e.target||e.target.id!=="ndQ")return;ND.q=e.target.value;clearTimeout(ndQT);ndQT=setTimeout(()=>{ndUi();ndAllBtn()},120)});
/* the sources the view shows that the server checks: what Check all (or Check these) goes through */
function ndVisChk(v){const c=ndChk(v);return ndSections(v).flatMap(r=>r.L.map(s=>s.id)).filter(i=>c.has(i))}
const ndWhole=()=>ND.tab==="all"&&!ND.q.trim();
/* which sources the server checks, in the order the page shows them */
const ndChk=v=>new Set(v.checks||["us-charts","us-enroute","tw-charts","openaip","layouts","navproc",...v.src.map(s=>s.id).filter(i=>/^ea-/.test(i))]);
const ndBtnTxt=id=>{const R=ND.run;if(R&&!R.end)return R.cur.includes(id)?"Checking…":R.ids.includes(id)&&!R.done.has(id)?"Waiting":"Check";return ND.busy===id?"Checking…":"Check"};
/* Check all: how far it has got, and which ones are being asked now */
function ndProgUi(v){const el=$("#ndProg"),R=ND.run;if(!el)return;if(!R){el.hidden=true;el.innerHTML="";return}el.hidden=false;
 const pc=x=>(R.of?x/R.of*100:0).toFixed(1)+"%",nm=id=>{const s=v&&v.src.find(x=>x.id===id);return s?s.region+" · "+s.name:id};
 const head=R.end?(R.stop&&R.n<R.of?"Stopped after "+R.n+" of "+R.of:"Checked all "+R.of):"Checked "+R.n+" of "+R.of;
 el.innerHTML='<div class="nd-bar'+(R.end?" end":"")+'" role="progressbar" aria-label="Checking the sources" aria-valuemin="0" aria-valuemax="'+R.of+'" aria-valuenow="'+R.n+'"><i style="width:'+pc(R.n)+'"></i>'+(R.end?"":'<i class="c" style="left:'+pc(R.n)+";width:"+pc(R.cur.length)+'"></i>')+"</div>"
  +'<div class="nd-pl"><b>'+head+"</b>"+(!R.end&&R.cur.length?"<small>"+(R.stop?"Stopping after ":"Now: ")+R.cur.map(id=>esc(nm(id))).join(", ")+"</small>":"")
  +(R.fail?'<small class="no">'+R.fail+" did not answer, try them again</small>":"")+"</div>"}
function ndAllBtn(){const b=$("#ndAll");if(!b)return;const R=ND.run;
 if(R&&!R.end){b.disabled=R.stop;b.textContent=R.stop?"Stopping…":"Stop";return}
 const v=opsV("nav"),n=v?ndVisChk(v).length:0;b.disabled=!!ND.busy||(!!v&&!n);b.textContent=ND.busy?"Checking…":ndWhole()?"Check all":n?"Check these "+n:"Nothing to check"}
/* the AIRAC reminder emails (airacmail.js): who gets them, what was sent for this cycle and the next, a test */
const RM_KIND={pre:"7 days before",due:"on the day",late:"3 days after",test:"test"};
function ndRmUi(v){const el=$("#ndRm"),R=v&&v.remind;if(!el)return;if(!R){el.hidden=true;return}el.hidden=false;
 const now=v.now||Date.now(),cys=[v.airac.cur.cycle,v.airac.next.cycle],bad=new Set();
 cys.forEach(cy=>{const c=(R.c||{})[cy]||{};Object.values(c).forEach(x=>(x&&x.res||[]).forEach(r=>{if(!r.ok)bad.add(r.to)}))});
 const sent=[];cys.forEach(cy=>{const c=(R.c||{})[cy]||{};["pre","due","late"].forEach(k=>{const x=c[k]||c[k+"Last"];if(!x)return;const ok=(x.res||[]).filter(r=>r.ok).length,n=(x.res||[]).length;
   sent.push("AIRAC "+esc(cy)+" · "+RM_KIND[k]+" · "+ndDay(x.t)+" "+akZ(x.t)+" · "+(n?ok+" of "+n+" delivered":"nobody to send to")+(c[k]?"":" · trying again every 2 h")+(!ok&&n&&x.res[0].err?" ("+esc(x.res[0].err)+")":""))})});
 const T=R.test;
 el.innerHTML='<div class="rm-h"><span>AIRAC reminders by email</span><button type="button" id="ndRmTest"'+(ND.rm?" disabled":"")+'>'+(ND.rm?"Sending…":"Send me a test")+"</button></div>"
  +"<p><small>To everyone whose role may update Nav Data: 7 days before an AIRAC, on the day and 3 days after, only while China’s or Japan’s uploads for it are missing.</small></p>"
  +(R.to.length?'<div class="rm-to">'+R.to.map(e=>'<i'+(bad.has(e)?' class="no" title="Last email to this address was not delivered"':"")+">"+esc(e)+"</i>").join("")+"</div>"
   :'<p class="rm-warn">'+(R.rolesOff?"Nobody yet: roles are off, so add people under Settings › Roles (or list them in ADMIN_EMAILS on the server).":"Nobody: no role may update Nav Data.")+"</p>")
  +(R.ready?"":'<p class="rm-bad">Email is not set up on the server yet: the EMAIL binding and MAIL_FROM (see the server README).</p>')
  +(sent.length?"<p><small>"+sent.join("<br>")+"</small></p>":"")
  +(T?'<p class="'+(T.ok?"":"rm-bad")+'"><small>Test to '+esc(T.to)+" · "+ndDay(T.t)+" "+akZ(T.t)+" · "+(T.ok?"sent":esc(T.err||"not sent"))+"</small></p>":"")
  +(ND.rmMsg?'<p class="rm-bad"><small>'+esc(ND.rmMsg)+"</small></p>":"")}
document.addEventListener("click",async e=>{const b=e.target.closest&&e.target.closest("#ndRmTest");if(!b||b.disabled||ND.rm)return;ND.rm=true;ND.rmMsg="";ndUi();
 try{const j=await api("/admin/api/navdata/remind-test",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});if(j.status)OPS.nav={at:Date.now(),v:j.status,p:null,err:""};if(!j.ok)ND.rmMsg=j.err||"Not sent"}
 catch(er){ND.rmMsg=er.message}finally{ND.rm=false;ndUi()}});
async function ndLoad(force){try{await opsGet("nav",force?0:60000)}catch(e){}if(pgNow==="navdata")ndUi()}
async function ndPostChk(body){const v=await api("/admin/api/navdata/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),timeout:120000});OPS.nav={at:Date.now(),v,p:null,err:""}}
async function ndCheck(id){if(ND.busy)return;ND.busy=id;ndAllBtn();ndUi();
 try{await ndPostChk({id})}
 catch(e){if(OPS.nav)OPS.nav.err=e.message;else OPS.nav={at:0,v:null,p:null,err:e.message}}
 finally{ND.busy="";ndAllBtn();ndUi()}}
/* every source, a few per request: the server may make only so many requests to other sites in one go */
async function ndCheckAll(){if(ND.busy)return;const v=opsV("nav");if(!v)return ndLoad(true);
 const ids=ndVisChk(v);if(!ids.length)return;const B=Math.max(1,v.batch||3),R=ND.run={ids,of:ids.length,n:0,cur:[],done:new Set(),fail:0,stop:false,end:false};ND.busy="*";ndAllBtn();
 for(let i=0;i<ids.length&&!R.stop;i+=B){R.cur=ids.slice(i,i+B);ndUi();
  try{await ndPostChk({ids:R.cur})}catch(e){R.fail+=R.cur.length}
  R.cur.forEach(x=>R.done.add(x));R.n+=R.cur.length}
 R.cur=[];R.end=true;ND.busy="";ndAllBtn();ndUi();
 setTimeout(()=>{if(ND.run===R){ND.run=null;ndUi()}},R.fail?15000:6000)}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("#ndAll,[data-ndchk]");if(!b||b.disabled)return;
 if(b.id==="ndAll"){if(ND.run&&!ND.run.end){ND.run.stop=true;ndAllBtn();ndUi()}else ndCheckAll();return}
 ndCheck(b.dataset.ndchk)});
PG_LOAD.navdata=()=>{ndUi();ndLoad(true)};PG_TICK.navdata=[()=>ndLoad(false),60000];

/* ---------- Official AIP uploads: China's data set and Japan's map data (zips), Japan's charts (a folder). Each is opened
   and read in this browser (cnparse.js, jpparse.js); only the reduced data, or the chart PDFs one by one, are sent. An
   AIRAC or a chart folder uploaded early switches by itself on its date. ---------- */
ND.up={cn:{busy:false,msg:"",err:"",ok:""},jp:{busy:false,msg:"",err:"",ok:""},jpc:{busy:false,msg:"",err:"",ok:""},cnc:{busy:false,msg:"",err:"",ok:""}};
const ndZ=t=>ndDay(t)+" "+new Date(t).toISOString().slice(11,16)+"Z";
const ndMB=n=>n>=1048576?(n/1048576).toFixed(n>=104857600?0:1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
const ND_DROP={cn:["Drop the AIP data set zip here","or click to choose it · eaipchina.cn › AIP Data Set › the BASELINE package. The current and the next AIRAC can both be uploaded."],
 jp:["Drop the 3_AIP(Shapefile, KML) zip here","or click to choose it · SWIM portal › AIP File Download › 3_AIP(Shapefile, KML), downloaded as a zip. It holds the current and the next AIRAC; both are uploaded."],
 cnc:["Drop the eAIP Full Package folder here","or click to choose it · eaipchina.cn › e-AIP › DOWNLOAD › Full Package, unzipped: the EAIP…_Web folder. Only aerodromes not uploaded yet for that AIRAC are sent."],
 jpc:["Drop the AD2_Separate folder here","or click to choose it · SWIM portal › AIP File Download › 1_AIP(PDF) › the AIP date › AD2_Separate. Only aerodrome folders not uploaded yet are sent."]};
/* a drop zone: a click (or Enter, Space) opens the page's one file picker (#ndFile, outside the list, so a reload of the
   list while the picker is open loses nothing) for this zone: a zip, or a folder */
const ndDrop=(rg,s)=>{const c=ND.up[rg],d=ND_DROP[rg];
 return '<label class="nd-drop'+(c.busy?" busy":"")+'" data-nddrop="'+rg+'" role="button" tabindex="0"'+(c.busy?' aria-disabled="true"':"")+">"
  +"<b>"+esc(c.busy?(c.msg||"Working…"):d[0])+"</b><small>"+(c.busy?"Keep this page open until it finishes":esc(d[1]))+"</small></label>"
  +(c.err?'<div class="msg err">'+esc(c.err)+"</div>":c.ok?'<div class="msg ok">'+esc(c.ok)+"</div>":"")};
function ndAipHtml(s,rg){const c=ND.up[rg],L=((s.cn&&s.cn.cycles)||[]).slice().sort((a,b)=>Date.parse(b.eff)-Date.parse(a.eff));
 const list=L.length?'<ul class="nd-cyl">'+L.map(x=>{const st=x.st||{};
   return '<li class="'+(x.inUse?"use":x.later?"later":"old")+'"><div><b>AIRAC '+esc(x.cycle)+'</b><span class="nd-tag">'+(x.inUse?"In use":x.later?"From "+ndZ(Date.parse(x.eff)):"Before")+"</span></div>"
    +'<small>'+esc([st.seg?(st.apt?st.apt+" airports · ":"")+(st.asp||0)+" airspaces · "+(st.seg||0)+" airway legs · "+(st.fix||0)+" fixes":"","uploaded "+ndDay(x.at)+" "+akZ(x.at)+(x.by?" by "+x.by:"")].filter(Boolean).join(" · "))+"</small>"
    +'<button type="button" class="nd-x" data-ndcndel="'+rg+":"+esc(x.cycle)+'"'+(c.busy?" disabled":"")+">Remove</button></li>"}).join("")+"</ul>":"";
 return list+ndDrop(rg,s)}
function ndJcHtml(s,rg){const A=(s.jc&&s.jc.apts)||[],now=Date.now(),t=e=>Date.UTC(+e.slice(0,4),+e.slice(4,6)-1,+e.slice(6,8)),f=e=>e.slice(6,8)+"/"+e.slice(4,6)+"/"+e.slice(0,4);
 const list=A.length?'<div class="nd-jc">'+A.map(x=>'<span title="'+esc(x.v.map(v=>f(v.eff)+": "+v.n+" charts, "+ndMB(v.size)).join("\\n"))+'"><b>'+esc(x.a)+"</b>"+(x.v.some(v=>t(v.eff)>now)?'<i class="later">new '+esc(x.v.filter(v=>t(v.eff)>now).map(v=>v.eff.slice(6,8)+"/"+v.eff.slice(4,6)).join(", "))+"</i>":"")+"</span>").join("")+"</div>":"";
 return list+ndDrop(rg||"jpc",s)}
const ndMsg=rg=>{const b=document.querySelector('[data-nddrop="'+rg+'"] b');if(b)b.textContent=ND.up[rg].msg};
async function ndRun(rg,fn){const c=ND.up[rg];if(c.busy)return;c.busy=true;c.err="";c.ok="";c.msg="Opening…";ndUi();
 try{c.ok=await fn(c)}catch(e){c.err=(e&&e.message)||String(e)}finally{c.busy=false;c.msg="";await ndLoad(true)}}
const ndPost=(u,b)=>api(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),timeout:120000});
/* (P2) a timeout for a fetch of its own (the chart uploads): 2 minutes */
const ndTmo=ms=>{if(typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function")return AbortSignal.timeout(ms);if(typeof AbortController!=="function")return undefined;const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal};
/* (P2) leaving the page while a document or a Nav Data upload is under way asks first */
window.addEventListener("beforeunload",e=>{if((typeof DC!=="undefined"&&DC.busy)||Object.values(ND.up||{}).some(c=>c&&c.busy)){e.preventDefault();e.returnValue=""}});
/* China: one AIRAC per zip */
const ndCnFile=f=>ndRun("cn",async c=>{if(!/\\.zip$/i.test(f.name))throw new Error("Choose the zip file: CN_AIP-DS_…_AIRAC….zip.");if(f.size>80*1048576)throw new Error("That file is too large to be the AIP data set.");
 const o=await CNP.open(await f.arrayBuffer(),p=>{c.msg="Checking each file against checksum.xml… "+Math.round(p*100)+"%";ndMsg("cn")});
 c.msg="Reading AIRAC "+o.cycle+"…";ndMsg("cn");await new Promise(r=>setTimeout(r,40));
 const d=CNP.parse(o.files),cells=CNP.cells(d);if(!d.st.apt||!d.st.seg)throw new Error("No airports or airways were found in this data set.");
 c.msg="Uploading AIRAC "+o.cycle+"…";ndMsg("cn");
 const r=await ndPost("/admin/api/navdata/cn",{meta:o.meta,sha:o.sha,file:f.name,size:f.size,st:d.st,apt:d.apt,asp:d.asp,cells}),eff=Date.parse(r.eff);
 return "AIRAC "+o.cycle+" uploaded. All "+o.checked+" files matched checksum.xml; "+d.st.apt+" airports, "+d.st.asp+" airspaces, "+d.st.seg+" airway legs, "+d.st.fix+" fixes and "+d.st.nav+" navaids. "
  +(r.active===o.cycle?"The EFB uses it now.":eff>Date.now()?"The EFB switches to it by itself "+ndZ(eff)+" (00:00 Beijing).":"A newer AIRAC is in use.")});
/* Japan's map data: every AIRAC in the zip */
const ndJpFile=f=>ndRun("jp",async c=>{if(!/\\.zip$/i.test(f.name))throw new Error("Choose the zip of 3_AIP(Shapefile, KML).");if(f.size>300*1048576)throw new Error("That file is too large.");
 const cys=await JPP.open(await f.arrayBuffer(),p=>{c.msg="Opening the KML files… "+Math.round(p*100)+"%";ndMsg("jp")}),done=[];
 for(const y of cys){c.msg="Reading AIRAC "+y.pub.slice(2)+"…";ndMsg("jp");await new Promise(r=>setTimeout(r,40));
  const d=JPP.parse(y.files),cells=JPP.cells(d);if(!d.st.seg)throw new Error("No airways were found for "+y.date+".");
  c.msg="Uploading AIRAC "+y.pub.slice(2)+"…";ndMsg("jp");
  const r=await ndPost("/admin/api/navdata/jp",{meta:{pub:y.pub,eff:y.eff,product:"AIP-JP"},file:f.name,size:f.size,st:d.st,apt:{},asp:d.asp,cells});
  done.push("AIRAC "+y.pub.slice(2)+(r.active===r.cycle?" (in use now)":Date.parse(r.eff)>Date.now()?" (from "+ndZ(Date.parse(r.eff))+")":"")+": "+d.st.asp+" airspaces, "+d.st.seg+" airway legs, "+d.st.fix+" fixes, "+d.st.nav+" navaids")}
 return "Uploaded. "+done.join(". ")+"."});
/* Japan's charts: the aerodrome folders (RJTT__20261126/RJTT__IAC (…)_20260416.pdf); a folder already here is skipped */
const ndJcFiles=items=>ndRun("jpc",async c=>{const G={};
 for(const it of items){const p=String(it.path||"").split("/");if(p.some(x=>/^AD2_Combine$/i.test(x)))continue;
  const fn=p[p.length-1],dir=p[p.length-2]||"",dm=dir.match(/^(R[JO][A-Z]{2})__(\\d{8})$/i),fm=fn.match(/^(R[JO][A-Z]{2})__(.+)_(\\d{8})\\.pdf$/i);
  if(!dm||!fm||fm[1].toUpperCase()!==dm[1].toUpperCase())continue;const k=dm[1].toUpperCase()+"|"+dm[2];(G[k]=G[k]||[]).push({name:fn,file:it.file})}
 const keys=Object.keys(G).sort();if(!keys.length)throw new Error("No aerodrome folders (like RJTT__20261126) were found. Drop AD2_Separate, or folders from it.");
 c.msg="Checking what is here…";ndMsg("jpc");
 const have=(await api("/admin/api/navdata/jpcharts")).apts||{},now=Date.now(),t=e=>Date.UTC(+e.slice(0,4),+e.slice(4,6)-1,+e.slice(6,8));
 /* per aerodrome: the folder in force today and any later one; older ones are not needed */
 const byA={};keys.forEach(k=>{const[a,e]=k.split("|");(byA[a]=byA[a]||[]).push(e)});
 const todo=[];let skip=0;
 Object.entries(byA).forEach(([a,E])=>{E.sort();const past=E.filter(e=>t(e)<=now),act=past.length?past[past.length-1]:null;
  E.filter(e=>!act||e>=act).forEach(e=>{const F=G[a+"|"+e],h=(have[a]||[]).find(v=>v.eff===e),size=F.reduce((s,x)=>s+x.file.size,0);
   if(h&&h.n===F.length&&h.size===size)skip++;else todo.push({a,e,F,size})})});
 const total=todo.reduce((s,x)=>s+x.F.length,0),bytes=todo.reduce((s,x)=>s+x.size,0);let sent=0,sentB=0;
 for(const x of todo){let next=0;const files=[];
  const one=async()=>{for(;;){const i=next++;if(i>=x.F.length)return;const f=x.F[i];
   for(let tr=0;;tr++){try{const r=await fetch("/admin/api/navdata/jpcharts/put?apt="+x.a+"&eff="+x.e+"&i="+i,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/pdf"},body:f.file,signal:ndTmo(120000)});
     if(!r.ok){let j=null;try{j=await r.json()}catch(e){}throw new Error((j&&j.error)||"HTTP "+r.status)}break}
    catch(e){if(tr>=2)throw new Error(x.a+" "+f.name+": "+e.message)}}
   files[i]={i,file:f.name,s:f.file.size};sent++;sentB+=f.file.size;c.msg="Uploading "+x.a+" · "+sent+" of "+total+" charts · "+ndMB(sentB)+" of "+ndMB(bytes);ndMsg("jpc")}};
  await Promise.all([one(),one(),one(),one()]);
  await ndPost("/admin/api/navdata/jpcharts/commit",{apt:x.a,eff:x.e,files})}
 const apts=new Set(todo.map(x=>x.a));
 return todo.length?"Uploaded "+total+" charts ("+ndMB(bytes)+") for "+apts.size+" aerodrome"+(apts.size>1?"s":"")+": "+[...apts].sort().slice(0,12).join(", ")+(apts.size>12?" …":"")+"."+(skip?" "+skip+" folder"+(skip>1?"s were":" was")+" already here.":""):"Nothing new: all "+skip+" aerodrome folders are already here."});
/* China's charts: the eAIP Full Package folder (EAIP2026-11.V1.5_Web). Its AD index (Data/JsonPath/AD.JSON) names every
   chart of AD 2.24 ("ZBAA-3P-8:SID RNAV RWY01/36L(ELKUR)") and its PDF (Data/EAIP2026-11.V1.5/Terminal/ZBAA/<hash>.pdf);
   the package is one AIRAC ("2026-11" = AIRAC 2611), in force from 00:00 Beijing on its date. The database coding tables
   are left out. An aerodrome already here for that AIRAC, with the same files, is skipped. */
function ndAiracDate(y,n){const D=864e5*28,t0=Date.UTC(2026,0,22),k=Math.ceil((Date.UTC(y,0,1)-t0)/D),t=t0+(k+n-1)*D,d=new Date(t);return d.getUTCFullYear()+String(d.getUTCMonth()+1).padStart(2,"0")+String(d.getUTCDate()).padStart(2,"0")}
const ndCcFiles=items=>ndRun("cnc",async c=>{let ad=null;const byT=new Map();
 for(const it of items){const p=String(it.path||"").replace(/\\\\/g,"/");if(/(^|\\/)Data\\/JsonPath\\/AD\\.JSON$/i.test(p))ad=it.file;
  const m=p.match(/Data\\/([^/]+)\\/Terminal\\/([A-Z0-9]{4})\\/([^/]+\\.pdf)$/i);if(m)byT.set((m[1]+"/"+m[2]+"/"+m[3]).toLowerCase(),it.file)}
 if(!ad)throw new Error("No Data/JsonPath/AD.JSON in what was dropped. Drop the whole EAIP…_Web folder of the Full Package.");
 c.msg="Reading the eAIP index…";ndMsg("cnc");let L;try{L=JSON.parse((await ad.text()).replace(/^﻿/,""))}catch(e){throw new Error("Data/JsonPath/AD.JSON couldn’t be read.")}
 const C=(Array.isArray(L)?L:[]).filter(n=>n&&/^Z[A-Z]{3}-\\d[0-9A-Z]*(-[0-9A-Z]+)?:/.test(n.name||"")&&n.pdfPath&&!/DATABASE CODING TABLE/i.test(n.name));
 if(!C.length)throw new Error("AD.JSON lists no aerodrome charts.");
 const vm=String(C[0].pdfPath).match(/\\/Data\\/EAIP(\\d{4})-(\\d{2})\\.V[^/]*\\//i);if(!vm)throw new Error("The AIRAC of this package couldn’t be told from its files.");
 const eff=ndAiracDate(+vm[1],+vm[2]),cyc=vm[1].slice(2)+vm[2];
 const G={};let miss=0;for(const n of C){const m=String(n.pdfPath).match(/\\/Data\\/([^/]+)\\/Terminal\\/([A-Z0-9]{4})\\/([^/]+\\.pdf)$/i),f=m&&byT.get((m[1]+"/"+m[2]+"/"+m[3]).toLowerCase());
  if(!f){miss++;continue}const a=n.name.slice(0,4).toUpperCase();(G[a]=G[a]||[]).push({name:n.name.trim(),file:f,chg:n.Is_Modified==="Y"})}
 if(!Object.keys(G).length)throw new Error("None of the chart PDFs that AD.JSON names were in the folder. Drop the whole EAIP…_Web folder.");
 c.msg="Checking what is here…";ndMsg("cnc");
 const have=(await api("/admin/api/navdata/cncharts")).apts||{},todo=[];let skip=0;
 Object.keys(G).sort().forEach(a=>{const F=G[a].slice(0,400),size=F.reduce((s,x)=>s+x.file.size,0),h=(have[a]||[]).find(v=>v.eff===eff);if(h&&h.n===F.length&&h.size===size)skip++;else todo.push({a,F,size})});
 const total=todo.reduce((s,x)=>s+x.F.length,0),bytes=todo.reduce((s,x)=>s+x.size,0);let sent=0,sentB=0;
 for(const x of todo){let next=0;const files=[];
  const one=async()=>{for(;;){const i=next++;if(i>=x.F.length)return;const f=x.F[i];
   for(let tr=0;;tr++){try{const r=await fetch("/admin/api/navdata/cncharts/put?apt="+x.a+"&eff="+eff+"&i="+i,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/pdf"},body:f.file,signal:ndTmo(120000)});
     if(!r.ok){let j=null;try{j=await r.json()}catch(e){}throw new Error((j&&j.error)||"HTTP "+r.status)}break}
    catch(e){if(tr>=2)throw new Error(x.a+" "+f.name+": "+e.message)}}
   files[i]={i,file:f.name,s:f.file.size,chg:f.chg?1:0};sent++;sentB+=f.file.size;c.msg="AIRAC "+cyc+" · uploading "+x.a+" · "+sent+" of "+total+" charts · "+ndMB(sentB)+" of "+ndMB(bytes);ndMsg("cnc")}};
  await Promise.all([one(),one(),one(),one()]);
  await ndPost("/admin/api/navdata/cncharts/commit",{apt:x.a,eff,files})}
 const apts=new Set(todo.map(x=>x.a)),when=Date.UTC(+eff.slice(0,4),+eff.slice(4,6)-1,+eff.slice(6,8))-8*36e5;
 return (todo.length?"AIRAC "+cyc+": uploaded "+total+" charts ("+ndMB(bytes)+") for "+apts.size+" aerodrome"+(apts.size>1?"s":"")+"."+(skip?" "+skip+" were already here.":""):"Nothing new: AIRAC "+cyc+" is already here for all "+skip+" aerodromes.")
  +(miss?" "+miss+" charts AD.JSON names were not in the folder.":"")+(when>Date.now()?" Pilots get it from "+ndZ(when)+" (00:00 Beijing).":"")});
/* a dropped folder: walk it (only Chrome and Edge give folders to a drop) */
async function ndWalk(entry,path,out){if(entry.isFile){const f=await new Promise((res,rej)=>entry.file(res,rej));out.push({path:path+entry.name,file:f});return}
 if(!entry.isDirectory)return;const rd=entry.createReader();for(;;){const L=await new Promise((res,rej)=>rd.readEntries(res,rej));if(!L.length)break;for(const e of L)await ndWalk(e,path+entry.name+"/",out)}}
function ndPick(rg){const f=$("#ndFile");if(!f||!ND.up[rg]||ND.up[rg].busy)return;ND.pick=rg;const dir=rg==="jpc"||rg==="cnc";
 if(dir){f.setAttribute("webkitdirectory","");f.multiple=true;f.removeAttribute("accept")}else{f.removeAttribute("webkitdirectory");f.multiple=false;f.accept=".zip,application/zip"}
 f.value="";f.click()}
document.addEventListener("click",e=>{const z=e.target.closest&&e.target.closest("[data-nddrop]");if(!z)return;e.preventDefault();ndPick(z.dataset.nddrop)});
document.addEventListener("keydown",e=>{const z=e.target&&e.target.closest&&e.target.closest("[data-nddrop]");if(!z||(e.key!=="Enter"&&e.key!==" "))return;e.preventDefault();ndPick(z.dataset.nddrop)});
document.addEventListener("change",e=>{const t=e.target;if(!t||t.id!=="ndFile")return;const rg=ND.pick,F=Array.from(t.files||[]);t.value="";if(!rg||!F.length||!ND.up[rg]||ND.up[rg].busy)return;
 if(rg==="cn")ndCnFile(F[0]);else if(rg==="jp")ndJpFile(F[0]);else(rg==="cnc"?ndCcFiles:ndJcFiles)(F.map(f=>({path:f.webkitRelativePath||f.name,file:f})))});
const ndFiles=e=>!!(e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes("Files"));
["dragenter","dragover"].forEach(k=>document.addEventListener(k,e=>{if(pgNow!=="navdata"||!ndFiles(e))return;e.preventDefault();const z=e.target.closest&&e.target.closest("[data-nddrop]"),ok=z&&!ND.up[z.dataset.nddrop].busy;
 document.querySelectorAll("[data-nddrop]").forEach(x=>x.classList.toggle("over",x===z&&ok));e.dataTransfer.dropEffect=ok?"copy":"none"}));
document.addEventListener("dragleave",e=>{if(pgNow==="navdata"&&!e.relatedTarget)document.querySelectorAll("[data-nddrop].over").forEach(x=>x.classList.remove("over"))});
document.addEventListener("drop",async e=>{if(pgNow!=="navdata"||!ndFiles(e))return;e.preventDefault();document.querySelectorAll("[data-nddrop].over").forEach(x=>x.classList.remove("over"));
 const z=e.target.closest&&e.target.closest("[data-nddrop]");if(!z||ND.up[z.dataset.nddrop].busy)return;const rg=z.dataset.nddrop,dt=e.dataTransfer;
 if(rg!=="jpc"&&rg!=="cnc"){if(dt.files.length){if(rg==="cn")ndCnFile(dt.files[0]);else ndJpFile(dt.files[0])}return}
 const FN=rg==="cnc"?ndCcFiles:ndJcFiles;
 const ents=Array.from(dt.items||[]).map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
 if(!ents.length){FN(Array.from(dt.files).map(f=>({path:f.name,file:f})));return}
 const c=ND.up[rg];c.busy=true;c.err="";c.ok="";c.msg="Reading the folder…";ndUi();const out=[];
 try{for(const en of ents)await ndWalk(en,"",out)}catch(er){c.busy=false;c.err="The folder couldn’t be read: "+er.message;ndUi();return}
 c.busy=false;FN(out)});
document.addEventListener("click",async e=>{const b=e.target.closest&&e.target.closest("[data-ndcndel]");if(!b||b.disabled)return;const[rg,cy]=b.dataset.ndcndel.split(":");
 if(!confirm("Remove AIRAC "+cy+" of "+(rg==="cn"?"the China AIP data set":"Japan’s AIP map data")+" from the EFB? If it is in use, the EFB shows none of this data until another uploaded AIRAC is in force."))return;
 await ndRun(rg,async()=>{await ndPost("/admin/api/navdata/"+rg+"/delete",{cycle:cy});return "AIRAC "+cy+" removed."})});
/* ---------- Documents: a cover for a document that has none ----------
   The cover is the first page, drawn in the browser when a PDF is uploaded. A document whose cover could not be drawn
   then gets one here, the next time the Documents page is open: one at a time, each tried once per visit. */
const DCC={busy:false,tried:new Set()};
async function dcCovFill(){if(DCC.busy||!DC.list||!Array.isArray(DC.list.docs))return;const L=DC.list.docs.filter(d=>!d.cover&&d.size<=60*1048576&&!DCC.tried.has(d.id+":"+d.v));if(!L.length)return;DCC.busy=true;let made=0;
 try{const lib=await dcLib();
  for(const d of L){DCC.tried.add(d.id+":"+d.v);let task=null;
   try{const r=await fetch("/admin/api/docs/file?id="+encodeURIComponent(d.id),{credentials:"same-origin"});if(!r.ok)continue;
    task=lib.getDocument({data:await r.arrayBuffer(),isEvalSupported:false});const doc=await task.promise,pg=await doc.getPage(1),v=pg.getViewport({scale:1}),vp=pg.getViewport({scale:Math.min(480/v.width,640/v.height)}),c=document.createElement("canvas");
    c.width=Math.round(vp.width);c.height=Math.round(vp.height);const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:g,viewport:vp}).promise;
    let q=.82,blob=null;for(;;){blob=await new Promise(res=>c.toBlob(res,"image/jpeg",q));if(!blob||blob.size<=380000||q<=.4)break;q-=.15}
    if(!blob)continue;const p=await fetch("/admin/api/docs/cover?id="+encodeURIComponent(d.id)+"&v="+d.v,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"image/jpeg"},body:blob});if(p.ok)made++}
   catch(e){}finally{try{if(task)task.destroy()}catch(e){}}}}
 catch(e){}DCC.busy=false;if(made){try{DC.list=await api("/admin/api/docs")}catch(e){}dcUi()}}
{const _l=dcLoad;dcLoad=async function(){const r=await _l.apply(this,arguments);dcCovFill();return r}}
/* ---------- Automatic messages (Nov 2026): the AOC messages the server sends crews by itself. Each is on or off (kept
   with the gate plan, stands.js), the arrival gate has its timing, and each has its wording (aoctpl.js). ---------- */
const AU_K=[["gate","on","Arrival gate","Before landing: a free gate at the destination, from the gate plan"],["dep","dep","Departure gate","When the crew check in: a free gate at the departure airport"],["ls","ls","Final loadsheet","15 minutes before STD, to crews who checked in with their SimBrief plan"],["sig","sig","SIGMET on the route","In flight: a SIGMET at their level within the next 900 nm, once per FIR and hazard"],["inr","inr","Arrival report","At the gate: OOOI times, block and air time, on time or late, the gate and the METAR"]];
const AT={v:null,ed:{},dirty:{},pt:0,foc:null,open:"",more:{},err:""};
const auSay=(t,ok)=>{const m=$("#auEdMsg")||$("#auMsg");if(m)m.innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
const auTop=(t,ok)=>{const m=$("#auMsg");if(m)m.innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
const auKind=k=>AT.v&&AT.v.kinds.find(x=>x.k===k);
const auOn=(v,sw)=>sw==="on"?!!v.on:sw==="dep"?!!v.dep:v[sw]!==false;
function auLast(l){if(!l)return"Not sent lately";const d=new Date(l.t),today=d.toISOString().slice(0,10)===new Date().toISOString().slice(0,10);
 return "Last: "+(l.cs?l.cs+" · ":"")+(today?"":d.toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"})+" ")+stZ(l.t)}
async function atLoad(){if(!["gates","auto"].some(pgHas))return;if(AT.v&&Object.keys(AT.dirty).length)return;
 try{const v=await api("/admin/api/aoctpl");AT.v=v;AT.ed={};v.kinds.forEach(x=>{AT.ed[x.k]={...v.tpl[x.k]}});AT.dirty={};AT.err=""}catch(e){AT.err=e.message}if(pgNow==="auto")auUi()}
function auFld(k,f){const F=AT.ed[k],v=F[f[0]]==null?"":F[f[0]];return '<label class="at-f"><span class="at-l">'+esc(f[1])+"</span>"+(f[2]===1?'<input type="text" data-atf="'+f[0]+'" maxlength="60" value="'+esc(v)+'" autocomplete="off" spellcheck="false">':'<textarea data-atf="'+f[0]+'" rows="'+Math.min(18,Math.max(f[2],String(v).split("\\n").length+1))+'" spellcheck="false" wrap="off">'+esc(v)+"</textarea>")+"</label>"}
function auEdHtml(k){const K=auKind(k),v=ST.saved,sec=f=>/(Chg|None)$/.test(f[0]),main=K.fields.filter(f=>!sec(f)),more=K.fields.filter(sec),gate=k==="gate"||k==="dep";
 return '<div class="au-ed"><div class="au-ec">'
  +(k==="gate"?'<div class="au-tm"><div><label for="auLead">Send before landing</label><span class="au-n"><input type="number" id="auLead" min="10" max="90" step="5" value="'+(v.lead||30)+'"> minutes</span></div><div><label for="auMiss">No gate rule for the flight</label><select id="auMiss"><option value="skip"'+(v.miss!=="ground"?" selected":"")+'>Send nothing</option><option value="ground"'+(v.miss==="ground"?" selected":"")+'>Send “GATE: CONTACT GROUND”</option></select></div><a class="lk" href="#gates">Gate rules ›</a></div>':k==="dep"?'<div class="au-tm"><a class="lk" href="#gates">Gate rules ›</a></div>':"")
  +'<p class="hint au-when">'+esc(K.when)+".</p>"+main.map(f=>auFld(k,f)).join("")
  +(more.length?'<details class="au-more" data-aumore="'+k+'"'+(AT.more[k]?" open":"")+"><summary>More wording <small>("+more.map(f=>esc(f[1].replace(/^Title|^Message/,x=>x.toLowerCase()))).join("; ")+")</small></summary>"+more.map(f=>auFld(k,f)).join("")+"</details>":"")
  +'<div class="at-tk"><span class="at-l">Insert a field</span><div>'+K.tokens.map(t=>'<button type="button" data-attk="'+t[0]+'" title="'+esc(t[1])+'">{'+t[0]+"}</button>").join("")+"</div></div>"
  +'<div class="actions"><button class="primary" type="button" data-ausave="'+k+'">Save</button><button type="button" data-aureset="'+k+'"'+(K.changed||AT.dirty[k]?"":" disabled")+'>Default wording</button></div><div id="auEdMsg"></div></div>'
  +'<div class="au-pv"><span class="at-l">Preview</span><div class="at-card"><b id="auPT"></b><pre id="auPB"></pre></div><p class="hint" style="margin:0">With sample values. <b>{ZFW:9}</b> sets a value to the right in 9 characters; <b>[[ TERMINAL {TERMINAL}]]</b> is left out when a field in it is empty.</p>'
  +'<a class="lk" href="'+(gate?"#gates":"#sent")+'">'+(gate?"Gates sent ›":"AOC messages sent ›")+"</a></div></div>"}
function auUi(){const el=$("#auList");if(!el)return;const v=ST.saved;
 if(!v||!AT.v){el.innerHTML=AT.err||ST.err?'<div class="msg err" style="margin:16px 20px">'+esc(AT.err||ST.err)+"</div>":'<p class="empty" style="padding:16px 20px">Loading…</p>';return}
 el.innerHTML=AU_K.map(([k,sw,name,sub])=>{const on=auOn(v,sw),open=AT.open===k;
  return '<div class="au-r'+(open?" open":"")+'" data-auk="'+k+'"><div class="au-h"><label class="au-sw"><input type="checkbox" role="switch" data-ausw="'+sw+'"'+(on?" checked":"")+"><span><b>"+esc(name)+"</b><small>"+esc(sub)+(k==="gate"&&on?" · "+(v.lead||30)+" min before landing":"")+"</small></span></label>"
   +'<span class="bdg '+(on?"on":"off")+'">'+(on?"On":"Off")+'</span><span class="au-last">'+esc(auLast((AT.v.last||{})[k]))+'</span><button type="button" class="lnk" data-aued="'+k+'" aria-expanded="'+open+'">'+(open?"Close":"Edit")+"</button></div>"
   +(open?auEdHtml(k):"")+"</div>"}).join("");
 if(AT.open)auPrev(AT.open)}
function auPrev(k){const K=auKind(k);if(!K)return;if(K.preview&&!AT.dirty[k]){$("#auPT").textContent=K.preview.title;$("#auPB").textContent=K.preview.body;$("#auPB").classList.remove("err");return}
 clearTimeout(AT.pt);AT.pt=setTimeout(async()=>{const q=AT.pq=(AT.pq||0)+1;try{const r=await api("/admin/api/aoctpl/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:k,fields:AT.ed[k]})});if(q!==AT.pq||AT.open!==k)return;$("#auPT").textContent=r.title;$("#auPB").textContent=r.body;$("#auPB").classList.remove("err")}
  catch(e){if(q!==AT.pq||AT.open!==k)return;$("#auPB").textContent=e.message;$("#auPB").classList.add("err")}},350)}
/* on and off, and the arrival gate's timing: only the switches changed are sent (part "sw"); the gates are not, so a
   switch never puts back gates as they were when this page loaded. Someone else's newer switches (409): nothing is
   saved, and the page takes theirs (the error says so) */
async function auPlan(patch){let j;
 try{j=await api("/admin/api/stands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(auBody(patch))})}
 catch(er){if(er.status===409&&er.data&&er.data.plan){ST.saved=stClone(er.data.plan);if(!ST.dirty)ST.plan=stClone(er.data.plan);opsDrop("stands");stStateUi()}throw er}
 ST.saved=stClone(j.plan);if(!ST.dirty)ST.plan=stClone(j.plan);opsDrop("stands");stStateUi();return j.plan}
document.addEventListener("change",async e=>{const t=e.target;if(!t.dataset||t.dataset.ausw==null)return;if(!ST.saved){t.checked=!t.checked;return}
 const sw=t.dataset.ausw,on=t.checked,name=AU_K.find(x=>x[1]===sw)[2];t.disabled=true;
 try{await auPlan({[sw]:on});auUi();auTop(name+(on?" is on.":" is off: it is not sent."),true)}catch(er){t.checked=!on;t.disabled=false;if(er.status===409)auUi();auTop(er.message)}});
document.addEventListener("input",e=>{const t=e.target;if(!t.dataset||!t.dataset.atf||!AT.open||!t.closest("#auto"))return;const k=AT.open;AT.ed[k][t.dataset.atf]=t.value;
 if(!AT.dirty[k]){AT.dirty[k]=1;const r=$('[data-aureset="'+k+'"]');if(r)r.disabled=false}auSay("");auPrev(k)});
document.addEventListener("focusin",e=>{const t=e.target;if(t&&t.dataset&&t.dataset.atf)AT.foc=t.dataset.atf});
document.addEventListener("toggle",e=>{const d=e.target;if(d&&d.dataset&&d.dataset.aumore)AT.more[d.dataset.aumore]=d.open},true);
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("#auto [data-aued],#auto [data-attk],#auto [data-ausave],#auto [data-aureset]");if(!t||t.disabled)return;const d=t.dataset;
 if(d.aued){const k=d.aued;if(AT.open&&AT.dirty[AT.open]){if(!confirm("Discard the changes to the wording of “"+auKind(AT.open).name+"”?"))return;AT.ed[AT.open]={...AT.v.tpl[AT.open]};delete AT.dirty[AT.open]}
  AT.open=AT.open===k?"":k;AT.foc=null;auTop("");auUi();if(AT.open){const r=$('[data-auk="'+k+'"]');if(r)r.scrollIntoView({block:"nearest",behavior:"smooth"})}return}
 const k=AT.open,K=auKind(k);if(!K)return;
 if(d.attk){const f=AT.foc&&K.fields.some(x=>x[0]===AT.foc)?AT.foc:(K.fields.find(x=>x[2]>1)||K.fields[0])[0],el=document.querySelector('#auto [data-atf="'+f+'"]');if(!el)return;
  const a=el.selectionStart==null?el.value.length:el.selectionStart,b=el.selectionEnd==null?a:el.selectionEnd,ins="{"+d.attk+"}";el.value=el.value.slice(0,a)+ins+el.value.slice(b);el.focus();el.setSelectionRange(a+ins.length,a+ins.length);
  el.dispatchEvent(new Event("input",{bubbles:true}));return}
 if(d.aureset){if(!confirm("Put the original wording of “"+K.name+"” back?"))return;t.disabled=true;
  try{const r=await api("/admin/api/aoctpl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:k,reset:true})});AT.ed[k]={...r.fields};AT.v.tpl[k]={...r.fields};K.changed=r.changed;K.preview=r.preview;delete AT.dirty[k];auUi();auSay("The original wording is back.",true)}
  catch(er){t.disabled=false;auSay(er.message)}return}
 if(d.ausave){t.disabled=true;const done=[];
  try{if(k==="gate"){const lead=Math.round(+$("#auLead").value),miss=$("#auMiss").value;if(!(lead>=10&&lead<=90))throw new Error("Send between 10 and 90 minutes before landing");
    if(lead!==(ST.saved.lead||30)||miss!==(ST.saved.miss||"skip")){await auPlan({lead,miss});done.push("timing")}}
   if(AT.dirty[k]){const r=await api("/admin/api/aoctpl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:k,fields:AT.ed[k]})});AT.ed[k]={...r.fields};AT.v.tpl[k]={...r.fields};K.changed=r.changed;K.preview=r.preview;delete AT.dirty[k];done.push("wording")}
   auUi();auSay(done.length?"Saved. “"+K.name+"” is sent with this "+done.join(" and ")+" from now on.":"Nothing was changed.",true)}
  catch(er){t.disabled=false;if(er.status===409)auUi();auSay(er.message)}}});
window.addEventListener("beforeunload",e=>{if(Object.keys(AT.dirty).length){e.preventDefault();e.returnValue=""}});
PG_LOAD.auto=()=>{auUi();stLoad();atLoad()};

/* on a phone the section tabs scroll: keep the open one in view */
const tabSee=()=>setTimeout(()=>{const a=document.querySelector(".side a[aria-current=true]");if(a&&a.parentElement.scrollWidth>a.parentElement.clientWidth)a.scrollIntoView({inline:"nearest",block:"nearest"})},60);
window.addEventListener("hashchange",tabSee);window.addEventListener("load",tabSee);
/* the sections bar on a narrow screen scrolls sideways: a fade at the edge that has more tabs past it (Settings is often
   off to the right) */
function sideScroll(){const s=document.querySelector(".side");if(!s)return;const over=s.scrollWidth-s.clientWidth>2;
 s.classList.toggle("more-l",over&&s.scrollLeft>2);s.classList.toggle("more-r",over&&s.scrollLeft<s.scrollWidth-s.clientWidth-2)}
{const s=document.querySelector(".side");if(s){s.addEventListener("scroll",sideScroll,{passive:true});sideScroll()}}
window.addEventListener("resize",sideScroll);window.addEventListener("load",sideScroll);window.addEventListener("hashchange",()=>setTimeout(sideScroll,120));
/* ---------- Documents: who has confirmed reading (for a document that asks for it) ---------- */
function dcAckHtml(d){if(!d.ack)return "";const A=(DC.list&&DC.list.acks||{})[d.id]||{},P=(PL.list&&PL.list.pilots)||[],all=P.map(p=>p.u);
 const cur=Object.keys(A).filter(u=>A[u].v===d.v),miss=all.filter(u=>!cur.includes(u)),open=DC.who===d.id;
 return '<div class="dc-ack"><span class="dc-ab">Read and confirmed: <b>'+cur.length+"</b>"+(all.length?" of "+all.length:"")+" pilots (v"+d.v+")</span>"+(all.length&&miss.length?'<button type="button" class="lkb" data-dcwho="'+esc(d.id)+'">'+(open?"Hide":"Who has not ("+miss.length+")")+"</button>":all.length?'<span class="dc-all">Everyone</span>':"")+
  (open?'<div class="dc-who">'+miss.map(u=>{const p=P.find(x=>x.u===u),o=A[u];return '<span class="dc-p'+(o?" old":"")+'"><b>'+esc(u)+"</b>"+(p&&p.name?"<small>"+esc(p.name)+"</small>":"")+(o?"<small>read v"+o.v+"</small>":"")+"</span>"}).join("")+"</div>":"")+"</div>"}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-dcwho]");if(!b)return;DC.who=DC.who===b.dataset.dcwho?"":b.dataset.dcwho;dcUi()});
/* ---------- Pilots: a pilot's profile beside the list ---------- */
async function plOpen(u){PL.sel=u;plUi();plProfUi();
 await Promise.allSettled([opsGet("ooo",60000),opsGet("live",30000),PL.ci?null:api("/admin/api/checkins").then(j=>{PL.ci=j.list||[]}).catch(()=>{PL.ci=[]}),DC.list?null:dcLoad(),IB.threads?null:ibLoad()]);
 if(PL.sel===u)plProfUi()}
function plProfUi(){const el=$("#plProf"),u=PL.sel,m=$("#pilots");if(!el)return;const p=u&&((PL.list&&PL.list.pilots)||[]).find(x=>x.u===u);
 m.classList.toggle("pf",!!p);el.hidden=!p;if(!p){el.innerHTML="";return}
 const lv=opsV("live"),fl=((lv&&lv.flights)||[]).find(f=>f.pilot===u||(p.cid&&String(f.cid)===String(p.cid))),ci=(PL.ci||[]).find(c=>c.u===u),oo=opsV("ooo");
 const F=((oo&&oo.log)||[]).filter(r=>r.pilot===u).sort((a,b)=>(b.in||b.done)-(a.in||a.done));
 const mine=t=>!!t&&(t.pilot===u||(t.m||[]).some(x=>x.pilot===u)||(!!p.cid&&(t.cid===p.cid||(t.m||[]).some(x=>x.cid===p.cid))));
 const msgs=[...S.mails.filter(x=>mine(x.to)).map(x=>({t:x.sendAt,k:"Notice",s:x.subject})),...S.aoc.filter(x=>mine(x.to)).map(x=>({t:x.t,k:"AOC",s:x.title})),...(IB.threads||[]).filter(t=>t.pilot===u).map(t=>({t:t.msgs[t.msgs.length-1].t,k:"Inbox",s:t.subj+" → "+t.dept}))].sort((a,b)=>b.t-a.t).slice(0,8);
 const D=((DC.list&&DC.list.docs)||[]).filter(d=>d.ack),A=(DC.list&&DC.list.acks)||{};
 el.innerHTML='<div class="pf-h"><div><h3>'+esc(p.u)+'</h3><div class="meta">'+esc([p.name,p.rank,p.cid?"CID "+p.cid:""].filter(Boolean).join(" · "))+'</div></div><button type="button" class="cm-x" data-plx aria-label="Close">✕</button></div>'+
  '<div class="pf-st">'+(p.devices?'<span class="pl-s on">Signed in · '+p.devices+" device"+(p.devices>1?"s":"")+"</span>":p.last?'<span class="pl-s was">Signed out</span>':'<span class="pl-s no">Never signed in</span>')+(p.last?'<span class="hint" style="margin:0">Last sign-in '+esc(ago(p.last))+"</span>":"")+"</div>"+
  '<div class="actions" style="margin-top:12px"><button type="button" class="primary" data-plmail="'+esc(p.u)+'" data-cid="'+esc(p.cid||"")+'" data-name="'+esc(p.name||"")+'">Message</button>'+(p.devices?'<button type="button" class="warn" data-plout="'+esc(p.u)+'">Sign out</button>':"")+"</div>"+
  '<div class="fo-s"><h4>Now</h4>'+(fl?'<button type="button" class="hm-f" data-hmgo="fw:'+esc(fl.cs)+'"><span class="cs">'+esc(fl.cs)+'</span><span class="rt">'+esc((fl.dep||"····")+" → "+(fl.arr||"····"))+'</span><span class="st"><b>'+(hmGround(fl)?"On the ground":"In the air")+"</b>Flight Watch ›</span></button>"
   :ci?'<p class="pf-p">Checked in for <b>'+esc(ci.fl||"a flight")+"</b> "+esc((ci.from?ci.from+" → ":"")+(ci.to||""))+(ci.std?" · STD "+otZ(ci.std):"")+"</p>":'<p class="hint" style="margin:0">'+(oo&&PL.ci?"Not flying and not checked in.":"Loading…")+"</p>")+"</div>"+
  '<div class="fo-s"><h4>Recent flights <small>'+(F.length?F.length+" in 90 days":"")+"</small></h4>"+(F.length?'<table class="pf-t"><tbody>'+F.slice(0,8).map(r=>{const al=otLate(r.in,r.sta),dl=otLate(r.out,r.std);return "<tr><td>"+esc(otDay(r.in||r.done))+"</td><td><b>"+esc(r.cs)+"</b></td><td>"+esc((r.dep||"?")+" → "+r.arr)+'</td><td class="m">'+otDur(r.out,r.in)+"</td><td>"+otDelta(al!=null?al:dl)+"</td></tr>"}).join("")+"</tbody></table>":'<p class="hint" style="margin:0">'+(oo?"No finished flight in the last 90 days.":"Loading…")+"</p>")+"</div>"+
  (!pgHas("comms")?"":'<div class="fo-s"><h4>Messages</h4>'+(msgs.length?msgs.map(x=>'<div class="pf-m"><span class="cm-k">'+x.k+"</span><span>"+esc(x.s)+"</span><time>"+cmWhen(x.t)+"</time></div>").join(""):'<p class="hint" style="margin:0">Nothing to or from '+esc(p.u)+" yet, apart from notices to all pilots.</p>")+"</div>")+
  (pgHas("docs")&&D.length?'<div class="fo-s"><h4>Documents to confirm</h4>'+D.map(d=>{const r=(A[d.id]||{})[u],ok=r&&r.v===d.v;return '<div class="pf-m"><span class="pf-d '+(ok?"ok":"no")+'">'+(ok?"✓":"–")+"</span><span>"+esc(d.title)+"</span><time>"+(ok?cmWhen(r.t):r?"read v"+r.v:"not read")+"</time></div>"}).join("")+"</div>":"")}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-plp],[data-plx]");if(!b)return;
 if(b.dataset.plp){plOpen(b.dataset.plp);return}PL.sel="";plUi();plProfUi()});
/* ---------- Broadcast (Nov 2026): the live broadcast desk (desk.js). What OBS shows on the streaming pilot's simulator
   PC, through Polaris Navdata there, and its scenes switched from here: TAKE puts Preview on air, the auto director
   switches by the flight's phase, the overlays are OBS's Browser source showing /live/o/<token>. Those who see the page
   watch; those who may direct the live broadcast change it (the server decides which, by the role). OBS's pictures
   come only while this page is open and in view. ---------- */
const BC={ws:null,want:false,role:"",me:"",cfg:null,pc:{on:false},pvw:"",imgs:{},log:[],plan:null,oo:null,land:null,fl:null,flAt:0,ph:"",n:0,cb:{},arm:"",armT:0,hidT:0,tileKey:"",retry:0,dirty:false,conn:false};
const BC_PH=[["parked","Parked"],["taxi","Taxi"],["takeoff","Takeoff"],["climb","Climb"],["cruise","Cruise"],["descent","Descent"],["approach","Approach"],["landing","Landing"]];
const BC_PN=Object.fromEntries(BC_PH);
const BC_OV=[["lt","Name and route","Bottom left"],["data","Flight data","Bottom right"],["map","Map","Top right"],["live","LIVE and logo","Top left"]];
const BC_SLATE=/back|brb|soon|slate|hold|break|intermission|稍後|休息|待機/i;
const bcDir=()=>BC.role==="dir";
const bcPcOn=()=>!!(BC.pc&&BC.pc.on);
const bcObsOn=()=>bcPcOn()&&BC.pc.obs&&BC.pc.obs.st==="on";
const bcScenes=()=>(bcObsOn()&&BC.pc.scenes)||[];
const bcSlate=()=>{const c=BC.cfg||{},L=bcScenes();return c.slate&&L.includes(c.slate)?c.slate:L.find(s=>BC_SLATE.test(s))||""};
const bcDur=ms=>{const s=Math.max(0,Math.floor((ms||0)/1000));return String(Math.floor(s/3600)).padStart(2,"0")+":"+String(Math.floor(s/60)%60).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
const bcHm=t=>new Date(t).toISOString().slice(11,16)+"Z";
const bcK=v=>Math.round(v).toLocaleString("en-US");
const bcSt=()=>(bcPcOn()&&BC.pc.stats)||null;
function bcSay(t,ok){const m=$("#bcMsg");if(!m)return;m.innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":"";if(t&&ok)setTimeout(()=>{if(m.textContent===t)m.innerHTML=""},3500)}
/* the desk, live */
function bcOpen(){if(BC.ws||!BC.want||document.querySelector(".deny"))return;let w;try{w=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/admin/api/desk/ws")}catch(e){return}
 BC.ws=w;w.onopen=()=>{BC.conn=true};
 w.onmessage=e=>{let j;try{j=JSON.parse(e.data)}catch(x){return}if(j&&j.t)bcIn(j)};
 w.onclose=e=>{if(BC.ws!==w)return;BC.ws=null;BC.conn=false;BC.role="";bcCbDrop();bcAll();if(BC.want){clearTimeout(BC.retry);BC.retry=setTimeout(bcOpen,wsRetry(BC,e))}};
 w.onerror=()=>{}}
/* the desk's connection went: commands still waiting for an answer may or may not have been done (P2) */
function bcCbDrop(){const L=Object.entries(BC.cb||{});BC.cb={};for(const [id,f] of L)try{f({t:"ack",id,ok:false,err:"Disconnected: check whether it happened"})}catch(e){}}
function bcClose(){BC.want=false;clearTimeout(BC.retry);const w=BC.ws;BC.ws=null;BC.conn=false;if(w)try{w.close()}catch(e){}}
setInterval(()=>{if(BC.ws&&BC.ws.readyState===1)try{BC.ws.send("ping")}catch(e){}},30000);
function bcIn(j){const P=BC.pc;switch(j.t){
 case "hello":wsOk(BC);BC.role=j.role;BC.me=j.me||"";BC.cfg=j.cfg;BC.pc=j.pc||{on:false};BC.pvw=j.pvw||"";BC.log=j.log||[];BC.plan=j.plan||null;BC.oo=j.oo||null;BC.land=j.land||null;BC.fl=BC.pc.fl||null;BC.flAt=BC.pc.flAt||0;BC.ph=BC.pc.ph||"";BC.imgs={};BC.tileKey="";bcAll();bcCamLink();break;
 case "cfg":BC.cfg=j.cfg;if(BC.rw&&BC.cfg&&BC.cfg.auto)BC.cfg.auto.rules=BC.rw;bcSetUi(false);bcStatus();bcOvs();bcAuto();bcEm();bcMon();bcCamLink();break;
 case "pc":BC.pc=j.pc||{on:false};if(!BC.pc.on){BC.imgs={};BC.fl=null;BC.ph=""}else{BC.fl=BC.pc.fl||null;BC.ph=BC.pc.ph||""}BC.tileKey="";bcAll();break;
 case "obs":if(P.on){P.obs=j.obs;if(!j.obs||j.obs.st!=="on"){P.scenes=[];P.pgm="";BC.imgs={}}}BC.tileKey="";bcAll();break;
 case "scenes":if(P.on){P.scenes=j.list||[];P.pgm=j.pgm||""}bcTiles();bcMon();bcAuto();bcSetUi(false);bcEm();break;
 case "pgm":if(P.on)P.pgm=j.name||"";bcTiles();bcMon();break;
 case "pvw":BC.pvw=j.name||"";bcTiles();bcMon();break;
 case "shot":BC.imgs[j.name]=j.img;bcShot(j.name);break;
 case "stats":if(P.on){P.stats=j.stats;P.statsAt=j.at||Date.now()}bcStatus();bcHealth();bcEm();bcMon();break;
 case "fl":BC.fl=j.f;BC.flAt=j.at||Date.now();if(j.ph)BC.ph=j.ph;bcFlight();break;
 case "ph":BC.ph=j.ph||"";bcFlight();bcAuto();break;
 case "plan":BC.plan=j.plan||null;bcFlight();bcSetUi(false);break;
 case "oo":BC.oo=j.oo||null;BC.land=j.land||null;bcFlight();break;
 case "log":BC.log.push(j.e);if(BC.log.length>100)BC.log.shift();bcLogUi();break;
 case "ack":{const f=BC.cb[j.id];delete BC.cb[j.id];if(f)f(j);else if(!j.ok)bcSay(j.err);break}
 default:}}
/* everything again (a new connection, the PC or OBS coming or going): Setup keeps what is being typed (bcSetUi(false));
   only Save puts the saved settings back over it */
function bcAll(){bcStatus();bcSetUi(false);bcMon();bcTiles();bcOvs();bcAuto();bcFlight();bcHealth();bcEm();bcLogUi()}
/* the chips at the top */
function bcStatus(){const el=$("#bcSt");if(!el)return;const c=BC.cfg,ch=(k,t)=>'<span class="bc-c '+k+'"><i></i>'+esc(t)+"</span>";
 if(!BC.conn||!c){el.innerHTML=ch("warn","Connecting to the desk…");return}
 const s=bcSt(),out=[];
 if(!c.on)out.push(ch("","No flight on the desk"));
 else if(!bcPcOn())out.push(ch("warn","Waiting for "+c.pilot+"’s simulator PC"));
 else{out.push(ch("ok","Simulator PC · Navdata "+(BC.pc.v||""))),out.push(bcObsOn()?ch("ok","OBS"):ch("bad","OBS not connected"))}
 if(s&&s.stream&&s.stream.on)out.push('<span class="bc-c air" id="bcClock"><i></i>ON AIR '+bcDur(s.stream.dur+(Date.now()-(BC.pc.statsAt||Date.now())))+"</span>");
 else if(bcObsOn())out.push(ch("","Off air"));
 if(s&&s.rec&&s.rec.on)out.push(ch("bad","REC"));
 if(BC.role==="view")out.push(ch("","Watching only"));
 el.innerHTML=out.join("")}
function bcClock(){const e=$("#bcClock"),s=bcSt();if(e&&s&&s.stream&&s.stream.on)e.lastChild.textContent="ON AIR "+bcDur(s.stream.dur+(Date.now()-(BC.pc.statsAt||Date.now())))}
/* Setup: the fields keep what is being typed */
function bcSetUi(force){const c=BC.cfg;if(!c)return;const d=bcDir();
 if(force||!BC.dirty){$("#bcOnC").checked=!!c.on;$("#bcPilot").value=c.pilot||"";$("#bcTitle").value=c.title||"";$("#bcSub").value=c.sub||"";BC.dirty=false}
 const auto=bcScenes().find(s=>BC_SLATE.test(s)),L=bcScenes().slice();if(c.slate&&!L.includes(c.slate))L.unshift(c.slate);
 const want=BC.dirty?$("#bcSlate").value:c.slate||"";
 {const sl=$("#bcSlate"),h='<option value="">'+esc(auto?"Automatic: "+auto:bcScenes().length?"Automatic: none sounds like it":"Automatic (from OBS’s scenes)")+"</option>"+L.map(s=>'<option value="'+esc(s)+'"'+(s===want?" selected":"")+">"+esc(s)+"</option>").join("");
  if(sl.dataset.k!==h){sl.dataset.k=h;sl.innerHTML=h}else if(!BC.dirty&&sl.value!==want)sl.value=want}
 const P=BC.plan;$("#bcSub").placeholder=P?[P.ac,[P.dep&&(P.dep.name||P.dep.icao),P.arr&&(P.arr.name||P.arr.icao)].filter(Boolean).join(" → ")].filter(Boolean).join(" · "):"From the pilot’s plan";
 $("#bcUrlW").hidden=!(d&&c.token);$("#bcSetB").hidden=!d;if(!d)$("#bcSet").hidden=true;document.querySelectorAll("#bc .bc-take,#bc .bc-pvw .hint").forEach(x=>{x.hidden=!d});if(d&&c.token){const u=location.origin+"/live/o/"+c.token;$("#bcUrl").value=u;$("#bcDemo").href=u+"?demo=1"}
 document.querySelectorAll("#bcSet .bc-act").forEach(x=>{x.disabled=!d})}
/* Program and Preview */
function bcPic(img,ph,name,why){const src=name&&BC.imgs[name];if(src){if(img.getAttribute("src")!==src)img.src=src;img.hidden=false;ph.hidden=true}else{img.hidden=true;img.removeAttribute("src");ph.hidden=false;ph.textContent=why}}
function bcMon(){if(!$("#bcPgmI"))return;const on=bcObsOn(),g=on?BC.pc.pgm:"",p=on?BC.pvw:"",s=bcSt(),air=!!(s&&s.stream&&s.stream.on);
 $("#bcPgmN").textContent=g||"—";$("#bcAir").hidden=!air;$("#bcPgm").classList.toggle("air",air);
 bcPic($("#bcPgmI"),$("#bcPgmE"),g,!BC.conn?"Connecting…":!bcPcOn()?"The simulator PC is not on the desk":!on?"OBS is not connected on the simulator PC":"Waiting for OBS’s picture…");
 $("#bcPvwN").textContent=p||"—";$("#bcPvwF").classList.toggle("pv",!!p);
 bcPic($("#bcPvwI"),$("#bcPvwE"),p,p?"Waiting for OBS’s picture…":on?"Pick a scene below":"—");
 const t=$("#bcTake");t.disabled=!bcDir()||!on||!p||p===g;$("#bcBrb").disabled=!bcDir()||!on}
/* the scenes, from OBS, in its order */
function bcTiles(){const el=$("#bcTiles");if(!el)return;const L=bcScenes(),g=bcObsOn()?BC.pc.pgm:"",p=BC.pvw,key=L.join("|")+"#"+g+"#"+p+"#"+BC.role;
 if(!L.length){BC.tileKey="";el.innerHTML='<p class="empty" style="grid-column:1/-1;margin:0">'+(!BC.conn?"Connecting…":!(BC.cfg&&BC.cfg.on)?"Put a flight on the desk under Setup: its scenes in OBS show here.":!bcPcOn()?"OBS’s scenes show here once the simulator PC is on the desk.":!bcObsOn()?"OBS is not connected on the simulator PC: "+esc((BC.pc.obs&&BC.pc.obs.err)||"open OBS there."):"OBS has no scenes.")+"</p>";$("#bcRef").disabled=!bcDir()||!bcPcOn();return}
 $("#bcRef").disabled=!bcDir();if(key===BC.tileKey)return;BC.tileKey=key;
 el.innerHTML=L.map((s,i)=>{const on=s===g,pv=s===p&&!on;return '<button type="button" class="bc-tile bc-act'+(on?" on":pv?" pv":"")+'" data-bcs="'+esc(s)+'" aria-label="'+esc(s+(on?", on air":pv?", in preview":""))+'"><span class="bc-fr"><img alt="" hidden data-bcimg="'+esc(s)+'"><span class="bc-ph">'+esc(s)+"</span>"+(on?'<span class="bc-tag">ON AIR</span>':pv?'<span class="bc-tag pv">PREVIEW</span>':"")+'</span><span class="bc-tn">'+(i<9?"<i>"+(i+1)+"</i>":"")+"<span>"+esc(s)+"</span></span></button>"}).join("");
 L.forEach(bcShot);if(!bcDir())el.querySelectorAll(".bc-act").forEach(x=>{x.disabled=true})}
function bcShot(name){const src=BC.imgs[name];if(!src)return;el:{for(const im of document.querySelectorAll("#bcTiles img[data-bcimg]"))if(im.dataset.bcimg===name){if(im.getAttribute("src")!==src)im.src=src;im.hidden=false;const ph=im.nextElementSibling;if(ph)ph.hidden=true;break el}}
 if(bcObsOn()&&(name===BC.pc.pgm||name===BC.pvw))bcMon()}
/* the overlays (OBS's Browser source shows them) */
function bcOvs(){const el=$("#bcOv"),c=BC.cfg;if(!el)return;if(!c){el.innerHTML='<span class="empty">Connecting…</span>';return}
 el.innerHTML=BC_OV.map(([k,t,s])=>'<label class="au-sw"><input type="checkbox" class="bc-act" data-bcov="'+k+'"'+(c.ov[k]?" checked":"")+(bcDir()?"":" disabled")+"><span><b>"+esc(t)+"</b><small>"+esc(s)+"</small></span></label>").join("")}
/* the auto director: which scenes for which phase */
function bcAuto(){const el=$("#bcRules"),c=BC.cfg;if(!el)return;if(!c){el.innerHTML="";$("#bcAutoH").textContent="";return}
 const A=c.auto,L=bcScenes(),d=bcDir();$("#bcAuto").checked=!!A.on;$("#bcAuto").disabled=!d;$("#bcEvery").value=String(A.every);$("#bcEvery").disabled=!d;
 $("#bcAutoH").textContent=A.on?"On"+(BC.ph?" · now "+(BC_PN[BC.ph]||BC.ph):"")+". TAKE turns it off.":"Off: you are directing.";
 el.innerHTML=BC_PH.map(([k,n])=>{const R=(A.rules&&A.rules[k])||[],left=L.filter(s=>!R.includes(s));
  return '<div class="bc-rule'+(BC.ph===k?" now":"")+'"><b>'+esc(n)+'</b><div class="bc-chips">'+(R.length?R.map((s,i)=>'<span class="bc-chip"><span>'+esc(s)+"</span>"+(d?'<button type="button" data-bcrm="'+k+"|"+i+'" aria-label="Remove '+esc(s)+'">×</button>':"")+"</span>").join(""):'<span class="none" title="The scene stays as it is">—</span>')+
  (d&&left.length?'<select data-bcadd="'+k+'" aria-label="Add a scene for '+esc(n)+'"><option value="">+ Add</option>'+left.map(s=>'<option value="'+esc(s)+'">'+esc(s)+"</option>").join("")+"</select>":"")+"</div></div>"}).join("")}
/* the flight: the plan, the numbers from the simulator, the block times */
function bcFlight(){const el=$("#bcFl");if(!el)return;const P=BC.plan,f=BC.fl,c=BC.cfg;
 if(!c||!c.pilot){el.innerHTML='<span class="empty">No streaming pilot set (Setup).</span>';return}
 const a=P&&P.arr,gc=(la,lo,lb,lob)=>{const R=Math.PI/180,x=Math.sin((lb-la)*R/2)**2+Math.cos(la*R)*Math.cos(lb*R)*Math.sin((lob-lo)*R/2)**2;return 2*3440.065*Math.asin(Math.min(1,Math.sqrt(x)))};
 const fresh=f&&Date.now()-BC.flAt<15000,eta=fresh&&!f.g&&f.gs>60&&a&&a.la!=null&&f.la!=null?bcHm(Date.now()+gc(f.la,f.lo,a.la,a.lo)/f.gs*3600e3):P&&P.inn?bcHm(P.inn)+" planned":"—";
 const kv=(k,v)=>"<div><small>"+k+"</small><b>"+v+"</b></div>",O=BC.oo||{};
 el.innerHTML='<p class="bc-fh">'+(P?"<b>"+esc(P.flight||P.cs||c.pilot)+"</b>"+esc([P.ac,(P.dep&&P.dep.icao||"?")+" → "+(P.arr&&P.arr.icao||"?")].filter(Boolean).join(" · ")):"<b>"+esc(c.pilot)+"</b>No plan loaded in the EFB yet")+"</p>"+
  '<div class="bc-kv">'+kv("Phase",esc(BC.ph?BC_PN[BC.ph]||BC.ph:"—"))+kv("Altitude",fresh?bcK(f.alt)+"<i>ft</i>":"—")+kv("Ground speed",fresh?bcK(f.gs)+"<i>kt</i>":"—")+kv("Heading",fresh&&f.h!=null?String(Math.round(((f.h%360)+360)%360)||360).padStart(3,"0")+"°":"—")+kv("Vertical speed",fresh?(f.vs>0?"+":"")+bcK(f.vs)+"<i>fpm</i>":"—")+kv("Arrival",esc(eta))+"</div>"+
  '<div class="bc-oo">'+["OUT","OFF","ON","IN"].map(k=>"<span>"+k+" <b>"+(O[k]?O[k].replace(":","")+"Z":"—")+"</b></span>").join("")+(BC.land&&BC.land.fpm!=null?"<span>Touchdown <b>"+bcK(BC.land.fpm)+" fpm"+(BC.land.g?", "+BC.land.g.toFixed(2)+" G":"")+"</b></span>":"")+"</div>"+
  (bcPcOn()&&!fresh?'<p class="hint">No numbers from the simulator yet: is it running on that PC?</p>':"")}
/* what OBS says about the stream, the recording and itself */
function bcHealth(){const el=$("#bcHl");if(!el)return;const s=bcSt(),r=(k,t,v)=>'<div class="bc-hr '+k+'"><i></i><span>'+esc(t)+"</span><b>"+esc(v)+"</b></div>",out=[];
 out.push(bcPcOn()?r("ok","Polaris Navdata","On the desk · "+(BC.pc.v||"")):r(BC.cfg&&BC.cfg.on?"warn":"","Polaris Navdata",BC.cfg&&BC.cfg.on?"Not on the desk yet":"—"));
 const o=bcPcOn()&&BC.pc.obs;out.push(!o?r("","OBS","—"):o.st==="on"?r("ok","OBS","Connected"+(o.v?" · WebSocket "+o.v:"")):r("bad","OBS",o.err||"Not connected"));
 if(s&&s.stream){const t=s.stream,drop=t.frames?t.skip/t.frames*100:0;
  out.push(t.on?r(t.rec?"warn":"ok","Stream",t.rec?"Reconnecting…":"On air · "+bcDur(t.dur)):r("","Stream","Off air"));
  if(t.on){out.push(r(t.kbps<1000?"warn":"ok","Upload",(t.kbps/1000).toFixed(1)+" Mbps"+(t.cong>.2?" · congested":"")));out.push(r(drop>1?"bad":drop>.2?"warn":"ok","Dropped frames (network)",drop.toFixed(1)+" %"))}}
 if(s&&s.obs){const g=s.obs,rd=g.rtotal?g.rskip/g.rtotal*100:0,en=g.ototal?g.oskip/g.ototal*100:0;out.push(r(g.fps<25?"warn":"ok","OBS frame rate",g.fps+" fps"));out.push(r(rd>1||en>1?"warn":"ok","Frames missed (render · encode)",rd.toFixed(1)+" % · "+en.toFixed(1)+" %"));out.push(r(g.cpu>80?"warn":"ok","OBS on the CPU",g.cpu+" %"))}
 if(s&&s.rec)out.push(s.rec.on?r("ok","Recording (backup)","On · "+bcDur(s.rec.dur)):r("","Recording (backup)","Off"));
 if(bcPcOn())out.push(r(BC.pc.remote?"ok":"","Start and end from here",BC.pc.remote?"Allowed":"Off on the PC"));
 el.innerHTML=out.join("")}
/* the buttons for a bad moment; ending the stream asks to be pressed twice */
/* (with the stats every 2 s: drawn again only when which buttons there are changes; their text, armed look and
   whether they can be pressed are changed in place, so a click, the second press of bcArm and the focus are kept) */
function bcEm(){const el=$("#bcEm");if(!el)return;const s=bcSt(),on=bcObsOn(),d=bcDir(),rem=bcPcOn()&&BC.pc.remote,air=!!(s&&s.stream&&s.stream.on),rec=!!(s&&s.rec&&s.rec.on),sl=bcSlate();
 const B=[["bcBrb2",sl?"Back soon (“"+sl+"”)":"Back soon: pick its scene under Setup",on&&!!sl,""],
  air?["bcStop","End the stream…",on&&rem,"Press again to end the stream"]:["bcStart","Start the stream…",on&&rem,"Press again to start the stream"],
  rec?["bcRecS","Stop the recording…",on&&rem,"Press again to stop the recording"]:["bcRec","Start the recording (backup)",on&&rem,""]];
 const hint=bcPcOn()&&!rem,key=B.map(x=>x[0]).join("|")+(hint?"|h":"");
 if(el.dataset.k!==key){el.dataset.k=key;el.innerHTML=B.map(x=>'<button type="button" class="bc-act" id="'+x[0]+'"></button>').join("")+(hint?'<p class="hint">Start and end: off on the simulator PC (its EFB, Ground › Simulator PC › Broadcast).</p>':"")}
 for(const [id,t,ok,arm] of B){const x=el.querySelector("#"+id);if(!x)continue;const a=BC.arm===id&&!!arm,txt=a?arm:t,dis=!(d&&ok);
  if(x.textContent!==txt)x.textContent=txt;if(x.disabled!==dis)x.disabled=dis;x.classList.toggle("arm",a)}}
function bcArm(id,go){if(BC.arm===id&&Date.now()-BC.armT<5000){BC.arm="";go()}else{BC.arm=id;BC.armT=Date.now();setTimeout(()=>{if(BC.arm===id&&Date.now()-BC.armT>=4900){BC.arm="";bcEm()}},5000)}bcEm()}
function bcLogUi(){const el=$("#bcLog");if(!el)return;const L=BC.log.slice(-40).reverse();
 el.innerHTML=L.length?L.map(e=>'<div class="bc-l"><time>'+bcHm(e.t)+"</time><div>"+esc(e.what)+(e.by?"<small>"+esc(e.by)+"</small>":"")+"</div></div>").join(""):'<span class="empty">Nothing yet.</span>'}
/* directing */
function bcCmd(op,name,x,done){if(!bcDir())return;const w=BC.ws;if(!w||w.readyState!==1){bcSay("Not connected to the desk: trying again…");return}
 const id="c"+(++BC.n);BC.cb[id]=j=>{if(!j.ok)bcSay(j.err||"Not done");if(done)done(j)};
 try{w.send(JSON.stringify({cmd:Object.assign({id,op,name:name||""},x||{})}))}catch(e){bcSay("Not connected to the desk")}}
function bcPick(name){if(!bcDir()||!bcScenes().includes(name))return;BC.pvw=name;bcTiles();bcMon();try{BC.ws.send(JSON.stringify({pvw:name}))}catch(e){}}
function bcTake(){const p=BC.pvw,g=bcObsOn()?BC.pc.pgm:"";if(!bcDir()||!p||p===g)return;bcCmd("scene",p,{swap:true})}
function bcBrb(){const s=bcSlate();if(!s){bcSay("No “Back soon” scene yet: pick one under Setup (or name one Back soon in OBS)");return}bcCmd("scene",s,{swap:false})}
async function bcPost(body,okMsg){try{const j=await api("/admin/api/desk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(j&&j.cfg)BC.cfg=j.cfg;if(okMsg)bcSay(okMsg,true);return true}catch(e){bcSay(e.message);return false}finally{bcSetUi(false);bcStatus();bcOvs();bcAuto();bcEm();bcCamLink()}}
const bcCfg=(cfg,okMsg)=>bcPost({op:"cfg",cfg},okMsg);
/* (P2, Nov 2026) a rule changed shows at once (BC.rw: the rules as they will be), and goes to the desk one change after
   another, each with all those before it: rapid × and + Add never undo each other. One refused puts back the rules the
   desk last had */
let bcRQ=Promise.resolve();
function bcRules(k,fn){if(!BC.cfg||!BC.cfg.auto)return Promise.resolve(false);if(!BC.rw)BC.rsv=JSON.parse(JSON.stringify(BC.cfg.auto.rules||{}));
 const R=JSON.parse(JSON.stringify(BC.cfg.auto.rules||{}));R[k]=fn(R[k]||[]);if(!R[k].length)delete R[k];BC.rw=R;BC.cfg.auto.rules=R;bcAuto();
 const go=async()=>{if(BC.rw!==R)return true;   /* a later change is waiting: it carries this one */
  const ok=await bcCfg({auto:{rules:R}});
  if(BC.rw===R){BC.rw=null;if(!ok&&BC.cfg&&BC.cfg.auto){BC.cfg.auto.rules=BC.rsv||{};bcAuto()}}else if(BC.cfg&&BC.cfg.auto){BC.cfg.auto.rules=BC.rw;bcAuto()}
  return ok};
 const p=bcRQ.then(go);bcRQ=p.then(()=>{},()=>{});return p}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("#bc button,#bc [data-bcs]");if(!t||t.disabled)return;
 /* a scene, TAKE or Back soon pressed with the mouse gives the focus back to the page, so 1–9 and Space go on working
    (a key on a focused button is the button's own); from the keyboard (detail 0) the focus stays where it is */
 if(e.detail>0&&t.blur&&(t.dataset.bcs!=null||/^(bcTake|bcBrb2?)$/.test(t.id)))t.blur();
 if(t.dataset.bcs!=null){bcPick(t.dataset.bcs);return}
 if(t.dataset.bcrm){const [k,i]=t.dataset.bcrm.split("|");bcRules(k,L=>L.filter((x,n)=>n!==+i));return}
 switch(t.id){
  case "bcSetB":{const s=$("#bcSet");s.hidden=!s.hidden;t.setAttribute("aria-expanded",String(!s.hidden));if(!s.hidden)bcSetUi(false);break}
  case "bcTake":bcTake();break;
  case "bcBrb":case "bcBrb2":bcBrb();break;
  case "bcRef":bcCmd("refresh","",null,j=>{if(j.ok)bcSay("OBS asked again for its scenes",true)});break;
  case "bcSave":bcCfg({on:$("#bcOnC").checked,pilot:$("#bcPilot").value.trim().toUpperCase(),title:$("#bcTitle").value,sub:$("#bcSub").value,slate:$("#bcSlate").value},"Saved").then(ok=>{if(ok){BC.dirty=false;bcSetUi(true)}});break;
  case "bcCopy":{const u=$("#bcUrl").value;(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>bcSay("The overlay link is copied",true),()=>{$("#bcUrl").select();bcSay("Copy the selected link")});break}
  case "bcTok":if(BC.arm==="bcTok"&&Date.now()-BC.armT<5000){BC.arm="";t.textContent="New link";bcPost({op:"token"},"A new overlay link: put it in OBS’s Browser source").then(()=>{})}else{BC.arm="bcTok";BC.armT=Date.now();t.textContent="Press again: the old link stops";setTimeout(()=>{if(BC.arm==="bcTok"){BC.arm="";t.textContent="New link"}},5000)}break;
  case "bcStart":bcArm("bcStart",()=>bcCmd("start"));break;
  case "bcStop":bcArm("bcStop",()=>bcCmd("stop"));break;
  case "bcRec":bcCmd("recstart");break;
  case "bcRecS":bcArm("bcRecS",()=>bcCmd("recstop"));break;
  default:}});
document.addEventListener("change",e=>{const t=e.target;if(!t.closest||!t.closest("#bc"))return;
 if(t.dataset.bcov){bcCfg({ov:{[t.dataset.bcov]:t.checked}});return}
 if(t.dataset.bcadd){const v=t.value;if(v)bcRules(t.dataset.bcadd,L=>L.concat([v]));return}
 if(t.id==="bcAuto"){bcCfg({auto:{on:t.checked}});return}
 if(t.id==="bcEvery"){bcCfg({auto:{every:+t.value}});return}
 if(t.id==="bcOnC"){const p=$("#bcPilot").value.trim().toUpperCase();bcCfg(Object.assign({on:t.checked},p?{pilot:p}:{}),t.checked?"On the desk: the simulator PC joins within about half a minute":"Off the desk").then(ok=>{if(!ok)t.checked=!t.checked});return}
 if(t.id==="bcSlate")BC.dirty=true});
document.addEventListener("input",e=>{if(e.target.closest&&e.target.closest("#bcSet")&&e.target.matches("input[type=text]"))BC.dirty=true});
/* Broadcast's keys, for whoever directs: 1–9 put a scene in Preview, Space takes Preview to Program. Only from the page
   itself: a key on a field or a control (a button, a link, a summary, a label, a switch…) is that control's (Space
   presses a focused button, ticks a box, opens a <details>). Space is the page's only when there is a take to do
   (TAKE is on); otherwise it is left alone (it scrolls, as on any page) */
const BC_KEYS_OFF='input,select,textarea,[contenteditable],details,button,a,summary,label,[role="button"],[role="link"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="switch"],[role="checkbox"],[role="radio"],[role="tab"],[role="option"],[role="slider"],[role="spinbutton"],[role="textbox"],[role="combobox"]';
const bcCanTake=()=>{const k=$("#bcTake"),g=bcObsOn()?BC.pc.pgm:"";return !!(BC.pvw&&BC.pvw!==g&&k&&!k.disabled)};
document.addEventListener("keydown",e=>{if(pgNow!=="bc"||!bcDir()||e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;const t=e.target;if(t&&t.closest&&t.closest(BC_KEYS_OFF))return;
 if(/^[1-9]$/.test(e.key)){const s=bcScenes()[+e.key-1];if(s){e.preventDefault();bcPick(s)}}
 else if(e.key===" "&&bcCanTake()){e.preventDefault();bcTake()}});
/* Polaris Cam (cam.js): its cockpit cameras, live, from their own WebSocket. Each picture is a 16-byte header
   ('P', 1, camera, codec, flags, 0, width, height, duration_ms, seq: little-endian) and a JPEG (codec 1) or H.264
   Annex-B (codec 2: decoded here with WebCodecs, where the browser has it). The page says what it has had (ack) every
   0.4 s, or sooner after 4 JPEGs or 8 H.264 frames, so the server knows it keeps up. H.264 plays about half a second
   behind, to be smooth; every VideoFrame is closed as soon as it is drawn or dropped, and at most 24 wait a camera.
   One player (mkCamView) a WebSocket: Broadcast's own channel (CAM), the streaming pilot's channel that Broadcast shows
   while no PC is on its own (CAMP, "Auto"), and the pilot of the flight open in Flight Watch (FWV). Two players can share
   one grid of four cameras (Broadcast's): only the one whose live() is true draws in it or writes its captions */
/* CAM_DQ: frames the decoder may have queued before it counts as stuck; above a whole GOP replayed at once (75) */
const CAM_Q=24,CAM_BUF=480,CAM_LOW=450,CAM_HIGH=650,CAM_DQ=90,CAM_VIEWS=[];
const camWC=()=>typeof VideoDecoder==="function"&&typeof EncodedVideoChunk==="function";
/* VideoDecoder.isConfigSupported, asked once a codec string (P2): true, false, or null while its answer is on its way.
   A browser without it (or one that cannot say) is let try */
const CAM_SUP=new Map();
function camSup(codec){if(typeof VideoDecoder!=="function"||typeof VideoDecoder.isConfigSupported!=="function")return true;
 if(CAM_SUP.has(codec))return CAM_SUP.get(codec);CAM_SUP.set(codec,null);
 Promise.resolve().then(()=>VideoDecoder.isConfigSupported({codec,optimizeForLatency:true,hardwareAcceleration:"prefer-hardware"})).then(r=>{CAM_SUP.set(codec,!(r&&r.supported===false))},()=>{CAM_SUP.set(codec,true)});
 return null}
/* the live connections (Broadcast's desk, the cameras), after a drop: again in 3 s, 6, 12, 24, then every 30 s (a
   little sooner, at random, so pages do not all come back at once); 3 s again once the server says hello. A close for
   a sign-in that ran out (4401), or three drops in a row, asks /admin/api/me whether the sign-in still holds; if it
   does not, the page says so, with Reload (P2, Nov 2026). X: the connection's own state (fails) */
const wsBack=n=>Math.round(Math.min(30000,3000*2**Math.max(0,Math.min(4,n)))*(0.75+Math.random()*0.25));
function wsRetry(X,e){const n=X.fails=(X.fails||0)+1;if(n>=3||(e&&e.code===4401))wsProbe();return wsBack(n-1)}
let WS_PROBE=0,WS_NOTE=false;
function wsProbe(){if(WS_PROBE&&Date.now()-WS_PROBE<20000)return;WS_PROBE=Date.now();
 /* still signed in: it answers who (a sign-in page instead, from Cloudflare Access, is not signed in) */
 api("/admin/api/me",{timeout:15000}).then(j=>{if(j&&j.email){if(WS_NOTE)wsNote("")}else wsNote("The live views cannot connect: your sign-in has probably run out. Reload the page to sign in again.",true)},e=>{if(e&&e.timeout)return;
  if(typeof navigator!=="undefined"&&navigator.onLine===false){wsNote("You are offline: the live views connect again when the network is back.");return}
  if(e&&e.status>=500){wsNote("The live views cannot connect right now. They keep trying.");return}
  wsNote("The live views cannot connect: your sign-in has probably run out. Reload the page to sign in again.",true)})}
function wsNote(t,reload){WS_NOTE=!!t;let el=document.getElementById("wsAuth");if(!t){if(el)el.remove();return}
 if(!el){el=document.createElement("div");el.id="wsAuth";el.className="msg err ws-auth";el.setAttribute("role","alert");document.body.appendChild(el)}
 el.innerHTML="<span>"+esc(t)+"</span>"+(reload?'<button type="button" data-wsreload>Reload</button>':"");const b=el.querySelector("[data-wsreload]");if(b)b.addEventListener("click",()=>location.reload())}
function wsOk(X){X.fails=0;if(WS_NOTE)wsNote("")}
/* a pilot ID as Polaris Cam's channels are named by it: 2-16 letters and digits, upper case ("" when it is not one) */
const camPilot=v=>{const s=String(v==null?"":v).trim().toUpperCase();return /^[A-Z0-9]{2,16}$/.test(s)?s:""};
/* the codec string ('avc1.' + profile, constraints, level) from the SPS (NAL type 7) of a key frame's Annex-B bytes */
function camAvcCodec(b,w){const n=b.length,hx=x=>(x|256).toString(16).slice(1);
 for(let i=0;i+6<n;i++){if(b[i]===0&&b[i+1]===0&&b[i+2]===1){if((b[i+3]&31)===7)return "avc1."+hx(b[i+4])+hx(b[i+5])+hx(b[i+6]);i+=2}}
 return w>1280?"avc1.640028":"avc1.64001f"}
const camFps=c=>{const L=c.ts;if(L.length<2||Date.now()-L[L.length-1]>2000)return 0;return (L.length-1)*1000/Math.max(1,L[L.length-1]-L[0])};
/* four cameras, as Broadcast's grid has them (Flight Watch draws its own with its card) */
const camGridHtml=()=>[0,1,2,3].map(i=>'<button type="button" class="bc-cc" data-camc="'+i+'"><div class="bc-cap"><b>Cam '+(i+1)+'</b><span>—</span><em></em></div><div class="bc-fr"><canvas hidden></canvas><span class="bc-ph">No picture</span></div></button>').join("");
/* one player. o: grid (its .bc-cg, a selector), url(V) (the WebSocket's path), live(V) (may it draw in the grid now;
   always, without), ui(V) (its status, around its captions), onIn(V,j) (after each message, and { t:"close" } when the
   socket drops), idle(V) (what a camera says while there is no socket), page (whose captions' fps are kept fresh) */
function mkCamView(o){
 const V={ws:null,want:false,role:"",token:"",pub:{on:false,cams:[]},watchers:0,retry:0,hidT:0,zoom:-1,armT:0,raf:0,page:o.page||"",
  c:[0,1,2,3].map(()=>({seq:0,acked:0,un:0,w:0,h:0,dur:33,ts:[],busy:false,next:null,shown:false,codec:0,nowc:false,dec:null,cfg:"",cw:0,ch:0,needKey:true,tsUs:0,keyAt:0,q:[],lastAt:0,lastTs:0,unsup:"",errN:0,retryAt:0}))};
 const live=()=>!o.live||!!o.live(V);
 const cell=i=>live()?document.querySelector(o.grid+' [data-camc="'+i+'"]'):null;
 V.live=live;V.cell=cell;
 V.open=()=>{if(V.ws||!V.want||document.querySelector(".deny"))return;let w;try{w=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+o.url(V))}catch(e){return}
  w.binaryType="arraybuffer";V.ws=w;
  w.onmessage=e=>{if(V.ws!==w)return;if(typeof e.data==="string"){let j;try{j=JSON.parse(e.data)}catch(x){return}if(j&&j.t)V.msg(j)}else if(e.data instanceof ArrayBuffer)V.frame(e.data)};
  w.onclose=e=>{if(V.ws!==w)return;V.ws=null;V.role="";V.blank();V.ui();if(o.onIn)o.onIn(V,{t:"close"});if(V.want){clearTimeout(V.retry);V.retry=setTimeout(V.open,wsRetry(V,e))}};
  w.onerror=()=>{}};
 /* closed for good (until opened again): its socket, decoders and frames, and what it knew of Polaris Cam */
 V.close=()=>{V.want=false;clearTimeout(V.retry);clearTimeout(V.hidT);const w=V.ws;V.ws=null;V.role="";V.token="";V.pub={on:false,cams:[]};V.watchers=0;V.zoom=-1;if(w)try{w.close()}catch(e){}V.blank()};
 /* the frames waiting to be drawn, closed; and the decoder, closed (nothing of either is left behind) */
 V.qDrop=c=>{while(c.q.length){const x=c.q.shift();try{x.frame.close()}catch(e){}}c.lastAt=0;c.lastTs=0};
 V.decStop=i=>{const c=V.c[i],d=c.dec;c.dec=null;c.cfg="";c.cw=0;c.ch=0;if(d)try{if(d.state!=="closed")d.close()}catch(e){}V.qDrop(c)};
 V.blank=()=>{V.c.forEach((c,i)=>{V.decStop(i);c.seq=0;c.acked=0;c.un=0;c.w=0;c.h=0;c.dur=33;c.ts=[];c.next=null;c.shown=false;c.codec=0;c.nowc=false;c.unsup="";c.errN=0;c.retryAt=0;c.needKey=true;c.tsUs=0;c.keyAt=0;const el=cell(i);if(el)el.querySelector("canvas").hidden=true})};
 V.msg=j=>{switch(j.t){
  case "hello":wsOk(V);V.role=j.role||"";V.token=j.token||"";V.pub=j.pub||{on:false,cams:[]};V.watchers=j.watchers||0;V.blank();V.ui();break;
  case "pub":{const was=V.pub&&V.pub.on;V.pub=j.pub||{on:false,cams:[]};V.watchers=j.watchers||0;if(was&&!V.pub.on)V.blank();else V.notH264();V.ui();break}
  case "token":V.token=j.token||"";V.ui();break;
  default:}
  if(o.onIn)o.onIn(V,j)};
 /* a camera Polaris Cam now says is off, gone or JPEG: its decoder and frames go now, not at its next picture */
 V.notH264=()=>{const P=V.pub||{},L=P.cams||[];if(!P.on||!L.length)return;
  for(let i=0;i<4;i++){const c=V.c[i],k=L.find(x=>x.i===i);if(k&&k.on!==false&&(k.codec||P.mode)==="h264")continue;
   if(c.dec||c.q.length)V.decStop(i);c.needKey=true}};
 V.frame=buf=>{if(buf.byteLength<18)return;const b=new Uint8Array(buf,0,16),d=new DataView(buf);
  if(b[0]!==0x50||b[1]!==1||b[2]>3)return;const i=b[2],c=V.c[i],seq=d.getUint32(12,true),now=Date.now(),codec=b[3];
  if(codec!==1&&codec!==2)return;
  c.seq=seq;c.w=d.getUint16(6,true);c.h=d.getUint16(8,true);c.dur=d.getUint16(10,true)||33;c.ts.push(now);while(c.ts.length&&now-c.ts[0]>2000)c.ts.shift();
  if(++c.un>=(codec===2?8:4))V.ack(i);
  if(codec===2){V.h264(i,buf,(b[4]&1)===1);return}
  /* JPEG: back from H.264, its decoder and frames go at once */
  if(c.codec!==1){if(c.dec||c.q.length)V.decStop(i);c.codec=1;c.nowc=false;c.needKey=true}
  if(c.busy){c.next=buf;return}V.draw(i,buf)};
 V.ack=i=>{const c=V.c[i],w=V.ws;if(!c.seq||c.seq===c.acked||!w||w.readyState!==1)return;try{w.send(JSON.stringify({t:"ack",cam:i,seq:c.seq}));c.acked=c.seq;c.un=0}catch(e){}};
 /* a key frame of that camera, please (at most once a second from here; the server holds back the rest) */
 V.key=(i,now)=>{const c=V.c[i],w=V.ws;now=now||Date.now();if(now-c.keyAt<1000||!w||w.readyState!==1)return;try{w.send(JSON.stringify({t:"key",cam:i}));c.keyAt=now}catch(e){}};
 V.h264=(i,buf,key)=>{const c=V.c[i];
  if(c.codec!==2){c.codec=2;c.next=null;c.needKey=true}
  if(!camWC()){if(!c.nowc){c.nowc=true;V.caps()}return}
  const data=new Uint8Array(buf,16);
  if(!c.dec||c.needKey||c.cw!==c.w||c.ch!==c.h){
   if(!key){V.key(i);return}   /* nothing to decode until a key frame */
   const codec=camAvcCodec(data,c.w);
   /* (P2) can this browser play it? Asked once a codec string; no: said on the camera, nothing more tried until it
      changes; still asking: the next key frame. After decoder errors in a row it waits before trying again */
   const sup=camSup(codec);if(sup===false){if(c.unsup!==codec){V.decStop(i);c.unsup=codec;V.caps()}return}if(sup===null)return;
   if(c.unsup){c.unsup="";V.caps()}
   if(c.retryAt&&Date.now()<c.retryAt)return;
   if(!c.dec||c.dec.state!=="configured"||c.cfg!==codec||c.cw!==c.w||c.ch!==c.h){V.decStop(i);
    let dec;try{dec=new VideoDecoder({output:f=>V.out(i,dec,f),error:()=>{if(c.dec===dec)V.decErr(i)}});
     dec.configure({codec,optimizeForLatency:true,hardwareAcceleration:"prefer-hardware"})}   /* no description: SPS/PPS come in the stream */
    catch(e){if(dec)try{dec.close()}catch(x){}V.decErr(i);return}
    c.dec=dec;c.cfg=codec;c.cw=c.w;c.ch=c.h}
   c.needKey=false}
  c.tsUs+=c.dur*1000;
  try{if(!key&&c.dec.decodeQueueSize>CAM_DQ)throw new Error("behind");c.dec.decode(new EncodedVideoChunk({type:key?"key":"delta",timestamp:c.tsUs,data}))}catch(e){V.decErr(i,!!e&&e.message==="behind")}};
 /* the decoder failed: start it again from the next key frame, asked for at once. Failing again with no picture between
    (a profile it cannot play): 2 s, 4, 8 … 30 s before the next try, not a new decoder a second (P2). Only behind: at once */
 V.decErr=(i,behind)=>{const c=V.c[i];V.decStop(i);c.needKey=true;c.keyAt=0;
  if(!behind){c.errN=(c.errN||0)+1;if(c.errN>1){c.retryAt=Date.now()+Math.min(30000,1000*2**(c.errN-1));return}}
  V.key(i)};
 V.out=(i,dec,f)=>{const c=V.c[i];if(c.dec!==dec){f.close();return}c.errN=0;c.retryAt=0;
  c.q.push({frame:f,at:performance.now(),ts:f.timestamp});
  while(c.q.length>CAM_Q||(document.hidden&&c.q.length))c.q.shift().frame.close();
  V.rafGo()};
 V.rafGo=()=>{if(!V.raf&&V.c.some(c=>c.q.length))V.raf=requestAnimationFrame(V.tick)};
 /* each screen refresh: the next frame of each H.264 camera, when it is due. The first at once; then at the stream's own
    pace, a little slower while less than ~0.45 s waits (so about half a second builds up), the oldest dropped past ~0.65 s */
 V.tick=t=>{V.raf=0;t=t||performance.now();
  for(let i=0;i<4;i++){const c=V.c[i],q=c.q;if(!q.length)continue;
   if(document.hidden){V.qDrop(c);continue}
   const span=()=>(q[q.length-1].ts-q[0].ts)/1000;
   if(span()>CAM_HIGH)while(q.length>1&&span()>CAM_BUF){q.shift().frame.close();c.lastAt=0}
   const h=q[0],due=c.lastAt?c.lastAt+Math.max(0,(h.ts-c.lastTs)/1000)*(span()<CAM_LOW?1.1:1):0;
   if(t<due)continue;
   q.shift();
   try{V.paint(i,h.frame,h.frame.displayWidth||c.w,h.frame.displayHeight||c.h)}catch(e){}finally{h.frame.close()}
   c.lastAt=due&&t-due<50?due:t;c.lastTs=h.ts}
  V.rafGo()};
 V.paint=(i,src,w,h)=>{const c=V.c[i],el=cell(i);if(!el||!V.ws||!V.pub.on)return;const cv=el.querySelector("canvas");
  if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}cv.getContext("2d").drawImage(src,0,0,w,h);if(cv.hidden){cv.hidden=false;c.shown=true;V.caps()}};
 V.draw=(i,buf)=>{const c=V.c[i];if(!cell(i))return;c.busy=true;
  const done=()=>{c.busy=false;if(c.next){const n=c.next;c.next=null;if(c.codec===1)V.draw(i,n)}};
  const paint=(src,w,h)=>{if(c.codec===1)V.paint(i,src,w,h)};
  const blob=new Blob([new Uint8Array(buf,16)],{type:"image/jpeg"});
  if(typeof createImageBitmap==="function"){createImageBitmap(blob).then(bm=>{try{paint(bm,bm.width,bm.height)}catch(e){}finally{if(bm.close)bm.close()}done()},()=>done());return}
  const u=URL.createObjectURL(blob),im=new Image();
  im.onload=()=>{URL.revokeObjectURL(u);try{paint(im,im.naturalWidth,im.naturalHeight)}catch(e){}done()};
  im.onerror=()=>{URL.revokeObjectURL(u);done()};im.src=u};
 /* the one camera Polaris Cam has on, when it has only one (-1 otherwise): shown alone, large, not as one of four */
 V.solo=()=>{const P=V.pub||{};if(!V.ws||!P.on)return -1;const on=(P.cams||[]).filter(k=>k&&k.on!==false&&k.i>=0&&k.i<4);return on.length===1?on[0].i:-1};
 /* each camera's caption, and what it says while there is no picture; one camera large (zoom) or all four */
 V.caps=()=>{if(!live())return;const P=V.pub||{},L=P.cams||[],solo=V.solo();if(solo>=0&&V.zoom>=0&&V.zoom!==solo)V.zoom=-1;
  for(let i=0;i<4;i++){const el=cell(i);if(!el)continue;const c=V.c[i],k=L.find(x=>x.i===i),cap=el.querySelector(".bc-cap"),ph=el.querySelector(".bc-ph");
   const w=c.w||(k&&k.w),h=c.h||(k&&k.h),f=camFps(c),md=c.codec===2?"H.264":c.codec===1?"JPEG":"";
   cap.querySelector("span").textContent=(k&&k.name)||"Camera "+(i+1);
   cap.querySelector("em").textContent=[md,w&&h?w+" × "+h:"",f?(f<9.95?f.toFixed(1):Math.round(f))+" fps":""].filter(Boolean).join(" · ");
   const nv=c.codec===2&&(c.nowc||!!c.unsup),shown=!el.querySelector("canvas").hidden&&!nv;
   if(nv)el.querySelector("canvas").hidden=true;
   ph.hidden=shown;if(!shown)ph.textContent=nv?(c.unsup?"This browser cannot play this camera’s H.264 ("+c.unsup+")":"H.264 needs Chrome or Edge"):!V.ws?(o.idle?o.idle(V):"Not connected"):!P.on?"Polaris Cam is offline":k&&!k.on?"Off":!V.watchers?"Waiting":"No picture yet";
   el.classList.toggle("z",V.zoom===i);el.setAttribute("aria-pressed",String(V.zoom===i));el.hidden=solo>=0&&i!==solo}
  const g=$(o.grid);if(g){g.classList.toggle("one",V.zoom>=0);g.classList.toggle("solo",solo>=0)}};
 /* the mode of the cameras that are on: H.264, JPEG, or both */
 V.mode=()=>{const P=V.pub||{},s=new Set((P.cams||[]).filter(k=>k.on!==false).map(k=>k.codec||P.mode));V.c.forEach(c=>{if(c.codec)s.add(c.codec===2?"h264":"jpeg")});
  if(!s.size)s.add(P.mode==="h264"?"h264":"jpeg");return s.size>1?"H.264 + JPEG":s.has("h264")?"H.264":"JPEG"};
 V.ui=()=>{if(o.ui)o.ui(V);else V.caps()};
 V.zoomTo=i=>{V.zoom=V.zoom===i?-1:i;V.caps()};
 CAM_VIEWS.push(V);return V}
/* Broadcast's grid, shared by its two players: Broadcast's own channel (CAM: always open while the page shows, so it
   knows whether a PC is on it, and has the link) and the streaming pilot's (CAMP, open only while no PC is on Broadcast's
   own). CAMB.src says whose the grid is now: "master", "pilot", or "" (nobody's: CAM says Offline there) */
const CAMB={src:"",pilot:"",hidT:0,link:null};
const CAM=mkCamView({grid:"#bcCamG",page:"bc",url:()=>"/admin/api/cam/ws",live:()=>CAMB.src!=="pilot",ui:()=>camUi(),onIn:()=>{if(CAMB.link)CAMB.link()}});
const CAMP=mkCamView({grid:"#bcCamG",page:"bc",url:()=>"/admin/api/cam/ws?pilot="+encodeURIComponent(CAMB.pilot),live:()=>CAMB.src==="pilot",ui:()=>camUi(),idle:()=>"Connecting…"});
/* Broadcast's own player, by the names the rest of the page knows it by */
const camIn=j=>CAM.msg(j),camFrame=buf=>CAM.frame(buf),camBlank=()=>CAM.blank(),camClose=()=>CAM.close(),camTick=t=>CAM.tick(t),camAck=i=>CAM.ack(i);
const camCaps=()=>(CAMB.src==="pilot"?CAMP:CAM).caps();
/* Broadcast's status line: where the pictures come from (Direct link: a PC on Broadcast's own channel; Auto: the
   streaming pilot's own), then as Polaris Cam is; the link under Setup, for directors */
function camUi(){const st=$("#bcCamSt");if(!st)return;const pv=CAMB.src==="pilot",V=pv?CAMP:CAM,P=V.pub||{};
 const ch=(cls,t)=>'<span class="bc-c '+cls+'"><i></i>'+esc(t)+"</span>";
 const go=CAM.role==="dir"&&CAM.token?'<button type="button" class="bc-src-go" data-bccamset title="Setup › Polaris Cam connection link">Link…</button>':"";
 st.innerHTML=!CAM.ws||!CAM.role?ch("","Connecting…"):(pv?'<span class="bc-c bc-src" title="The streaming pilot’s own Polaris Cam, signed in with Polaris Navdata. A PC on the Direct link (Setup) takes over">'+esc("Auto · "+CAMB.pilot)+"</span>"+go
   :CAM.pub&&CAM.pub.on?'<span class="bc-c bc-src" title="A PC connected with the Polaris Cam link under Setup: it is shown instead of the streaming pilot’s own">Direct link (overrides Auto)</span>'+go:go)+
  (!V.ws||!V.role?ch("","Connecting…"):P.on?ch("ok","Online")+(P.v?ch("","v"+P.v):"")+ch("",V.mode())+ch("",V.watchers+" watching"):ch("bad","Offline"));
 const W=$("#bcCamW");W.hidden=!(CAM.role==="dir"&&CAM.token);if(!W.hidden)$("#bcCamUrl").value=location.origin+"/live/cam/"+CAM.token;
 V.caps()}
async function camTok(t){if(CAM.armT&&Date.now()-CAM.armT<5000){CAM.armT=0;t.textContent="New link";t.disabled=true;
  try{const j=await api("/admin/api/cam",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({op:"token"})});if(j&&j.token)CAM.token=j.token;if(j&&j.pub)CAM.pub=j.pub;bcSay("A new Polaris Cam link: paste it into Polaris Cam on the simulator PC",true)}
  catch(e){bcSay(e.message)}finally{t.disabled=false;camUi();bcCamLink()}return}
 CAM.armT=Date.now();t.textContent="Press again: the old link stops";setTimeout(()=>{if(CAM.armT&&Date.now()-CAM.armT>=4900){CAM.armT=0;t.textContent="New link"}},5000)}
/* Broadcast, Option A: whose cameras it shows. A PC on Broadcast's own channel (its link, under Setup) comes first:
   "Direct link". Else, with a streaming pilot set (Setup), that pilot's own channel, where their Polaris Cam signs in
   by itself with Polaris Navdata: "Auto · <pilot>". Else nobody's: Offline. Never two streams at once: the pilot's
   player is closed as soon as a PC is on Broadcast's own. Asked again when either says something, when the streaming
   pilot changes, and as the page opens, closes, hides or shows */
function bcCamLink(){const sp=camPilot(BC.cfg&&BC.cfg.pilot),on=pgNow==="bc"&&CAM.want;
 let src=!on?"":!CAM.role?CAMB.src:CAM.pub&&CAM.pub.on?"master":"pilot";   /* while CAM reconnects, as it was */
 if(src==="pilot"&&!sp)src="";
 if(CAMP.want&&(src!=="pilot"||CAMB.pilot!==sp))CAMP.close();             /* its pictures go while the grid is still its */
 if(src!==CAMB.src){CAMB.src=src;CAM.zoom=-1;CAMP.zoom=-1}
 if(src==="pilot"&&!CAMP.want){CAMB.pilot=sp;CAMP.want=true;CAMP.open()}
 camUi()}
CAMB.link=bcCamLink;
function bcCamOn(){CAM.want=true;CAM.open();bcCamLink()}
function bcCamOff(){CAM.close();bcCamLink()}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("#bcCamG [data-camc],#bcCamCopy,#bcCamTok");if(!t||t.disabled)return;
 if(t.dataset.camc!=null){(CAMB.src==="pilot"?CAMP:CAM).zoomTo(+t.dataset.camc);return}
 if(t.id==="bcCamCopy"){const u=$("#bcCamUrl").value;(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>bcSay("The Polaris Cam link is copied",true),()=>{$("#bcCamUrl").select();bcSay("Copy the selected link")});return}
 if(t.id==="bcCamTok")camTok(t)});
/* Link… beside the source: Setup opened at the Polaris Cam link */
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-bccamset]");if(!t)return;const s=$("#bcSet"),b=$("#bcSetB"),u=$("#bcCamUrl");if(!s)return;
 if(s.hidden){s.hidden=false;if(b)b.setAttribute("aria-expanded","true");bcSetUi(false)}
 if(u){u.scrollIntoView({block:"center"});u.focus();u.select()}});
/* every player: its acks every 0.4 s, the keep-alive every 30 s, its captions (fps) every second while its page shows */
setInterval(()=>{CAM_VIEWS.forEach(V=>{for(let i=0;i<4;i++)V.ack(i)})},400);
/* Esc: a camera seen large goes back to all of them (Flight Watch's Cockpit Monitor, Broadcast's Polaris Cam). Taken
   first (capture) and marked done, so Flight Watch's own Esc (it closes the open flight) leaves it; not from a field */
function camEsc(e){if(e.key!=="Escape"||e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey)return;const t=e.target;
 if(t&&t.closest&&t.closest("input,textarea,select,[contenteditable]"))return;
 let took=false;
 /* Broadcast: a button armed for its second press (Start the stream…, New link) goes back as well (P2) */
 if(pgNow==="bc"&&typeof BC!=="undefined"&&BC.arm){const a=BC.arm;BC.arm="";took=true;if(a==="bcTok"){const x=document.getElementById("bcTok");if(x)x.textContent="New link"}else if(typeof bcEm==="function")bcEm()}
 const V=pgNow==="fw"?FWV:pgNow==="bc"?(CAMB.src==="pilot"?CAMP:CAM):null;if(V&&V.zoom>=0){V.zoom=-1;V.caps();took=true}
 if(took)e.preventDefault()}
document.addEventListener("keydown",camEsc,true);
setInterval(()=>{CAM_VIEWS.forEach(V=>{if(V.ws&&V.ws.readyState===1)try{V.ws.send("ping")}catch(e){}})},30000);
setInterval(()=>{if(document.hidden)return;CAM_VIEWS.forEach(V=>{if(V.ws&&V.page===pgNow)V.caps()})},1000);
window.addEventListener("pm:tab",()=>{if(pgNow!=="bc")bcCamOff()});
document.addEventListener("visibilitychange",()=>{if(pgNow!=="bc")return;clearTimeout(CAMB.hidT);if(document.hidden)CAMB.hidT=setTimeout(()=>{if(document.hidden&&pgNow==="bc")bcCamOff()},60000);else if(!CAM.want)bcCamOn()});
/* ---------- Flight Watch: the cockpit cameras (Polaris Cam, cam.js) of the pilots whose PC has it on. Who is online is
   asked every 15 s while the page shows (and as it opens or comes back into view): their flights get a CAM mark in the
   list, and the strip above it lists them all, with a pilot who has no flight on the map (parked, or testing) too.
   The open flight's pilot, or the pilot picked in the strip, is watched in the Cockpit Monitor: at once while they are
   online, never while they are not (Connect waits for them), one pilot at a time. Closed as soon as the flight changes
   or closes, the page is left, or the browser tab has been hidden for a minute: their PC then sends nothing. ---------- */
const FW_CAM={online:{},busy:false,off:false,pilot:"",ground:"",paused:false,manual:false,away:false,hidT:0,tok:"",armT:0};
const fwCamDir=()=>!PERM||PERM.can.has("live");
const fwCamOn=p=>!!p&&Object.prototype.hasOwnProperty.call(FW_CAM.online,p);
/* each pilot's flight on the map (not the sample flights) */
function fwCamFlights(){const F=window.pmLive?window.pmLive.flights():[],by={};F.forEach(f=>{const p=!f.sample&&camPilot(f.pilot);if(p&&!by[p])by[p]=f});return by}
const FWV=mkCamView({grid:"#foCamG",page:"fw",url:()=>"/admin/api/cam/ws?pilot="+encodeURIComponent(FW_CAM.pilot),ui:()=>fwCamUi(),onIn:(V,j)=>fwCamIn(V,j),
 idle:()=>FW_CAM.paused?"Paused":fwCamOn(FW_CAM.pilot)?"Connecting…":"Polaris Cam is offline"});
/* whom the monitor is for: the open flight's pilot, or (no flight open) the pilot picked in the strip */
function fwCamTarget(){if(pgNow!=="fw"||document.querySelector(".deny"))return "";const f=FO.f;return f?(f.sample?"":camPilot(f.pilot)):FW_CAM.ground}
/* the monitor as it should be now: another pilot closes the one before at once; open while the pilot is online (or
   Connect was pressed), not paused, and the tab has not been hidden for a minute */
function fwCamSync(draw){if(FO.f)FW_CAM.ground="";const p=fwCamTarget();
 if(p!==FW_CAM.pilot){FWV.close();FW_CAM.pilot=p;FW_CAM.paused=false;FW_CAM.manual=false;FW_CAM.tok="";FW_CAM.armT=0;draw=true}
 if(draw)fwCamCard();
 const go=!!p&&!FW_CAM.paused&&!FW_CAM.away&&(FW_CAM.manual||fwCamOn(p)||!!(FWV.ws&&FWV.pub&&FWV.pub.on));
 if(go&&!FWV.want){FWV.want=true;FWV.open()}else if(!go&&FWV.want)FWV.close();
 fwCamUi()}
function fwCamIn(V,j){const p=FW_CAM.pilot;if(!p)return;
 /* what the pilot's own channel says counts over the list; once they are on, Connect has done its part (when they go, so does the socket) */
 if(j.t==="hello"||j.t==="pub"){const P=V.pub||{};if(P.on)FW_CAM.manual=false;if(P.on)FW_CAM.online[p]={v:P.v||"",mode:P.mode||"jpeg",cams:P.cams||[],at:P.at||0};else delete FW_CAM.online[p];fwCamStrip();fwCamRows()}
 if(V.token)FW_CAM.tok=V.token;
 fwCamSync()}
async function fwCamLoad(){if(FW_CAM.busy||FW_CAM.off||document.querySelector(".deny")||!pgHas("fw"))return;FW_CAM.busy=true;
 try{const j=await api("/admin/api/cam/online"),o=(j&&j.online)||{},n={};
  for(const k of Object.keys(o)){const p=camPilot(k);if(p&&o[k]&&typeof o[k]==="object")n[p]=o[k]}
  const p=FW_CAM.pilot;if(p&&FWV.ws&&FWV.role){if(FWV.pub&&FWV.pub.on)n[p]=FWV.pub;else delete n[p]}
  FW_CAM.online=n}
 catch(e){if(/not set up/i.test(e.message))FW_CAM.off=true}
 finally{FW_CAM.busy=false}
 fwCamStrip();fwCamRows();fwCamSync()}
/* the flight list: CAM beside the callsign of a flight whose pilot's Polaris Cam is on */
function fwCamRows(){const by={};(window.pmLive?window.pmLive.flights():[]).forEach(f=>{const p=!f.sample&&camPilot(f.pilot);if(p&&fwCamOn(p))by[f.cs]=p});
 document.querySelectorAll("#lvList [data-cs]").forEach(row=>{const p=by[row.dataset.cs];let s=row.querySelector(".fw-cb");
  if(!p){if(s)s.remove();return}
  if(!s){s=document.createElement("span");s.className="fw-cb";s.innerHTML="<i></i>CAM";(row.querySelector(".lv-cs")||row).appendChild(s)}
  s.title=p+": Polaris Cam is on"})}
/* the strip: every pilot online, with their flight's callsign (a click opens it) or "on ground" (a click watches them here) */
function fwCamStrip(){const el=$("#fwCam");if(!el)return;const L=Object.keys(FW_CAM.online).sort(),F=fwCamFlights();
 if(!L.length){el.hidden=true;if(el.innerHTML)el.innerHTML="";el._fp="";return}
 el.hidden=false;
 const h='<div class="fw-h"><b>Cockpit cameras</b><span>'+L.length+' online</span></div><div class="fw-cps">'+L.map(p=>{const f=F[p];
  return '<button type="button" class="fw-cp'+(FW_CAM.ground===p?" on":"")+'" data-fwcp="'+esc(p)+'" aria-pressed="'+(FW_CAM.ground===p)+'" title="'+esc(f?"Open "+f.cs+" and watch its cockpit":"Watch "+p+"’s cockpit here: no flight on the map")+'"><i></i><b>'+esc(p)+"</b><small>"+esc(f?f.cs:"on ground")+"</small></button>"}).join("")+"</div>";if(el._fp===h)return;el._fp=h;el.innerHTML=h}
/* the Cockpit Monitor's card: in the open flight's panel, or under the strip for a pilot picked there */
const fwCamHtml=(p,g)=>'<div class="fo-s fo-cam"><div class="fo-camh"><h4>Cockpit Monitor <small>'+esc(p)+'</small></h4><div class="fo-camb"><button type="button" data-fwc="go" id="foCamGo">Connect</button>'+(g?'<button type="button" data-fwc="x" title="Close" aria-label="Close">✕</button>':"")+"</div></div>"+
 '<div class="bc-st fo-camst" id="foCamSt"></div><div class="bc-cg fo-cg" id="foCamG" hidden>'+camGridHtml()+"</div>"+
 (fwCamDir()?'<details class="fo-camk" id="foCamK"><summary>Manual link for '+esc(p)+'</summary><div class="bc-urlr"><input type="text" id="foCamUrl" readonly placeholder="Loading…" aria-label="Polaris Cam link for '+esc(p)+'"><button type="button" data-fwc="copy">Copy</button><button type="button" data-fwc="tok">New link</button></div><p class="hint">For a PC whose Polaris Cam does not sign in with Polaris Navdata: paste this link into Polaris Cam there. A new link stops the PC on the old one (not one signed in with Navdata).</p><div id="foCamSay"></div></details>':"")+
 '<p class="hint fo-camhint">'+(g?"No flight of "+esc(p)+" on the map: parked, or testing. ":"")+"Only while you watch: their PC sends nothing otherwise. Click a camera to see it large; Esc for all of them.</p></div>";
function fwCamCard(){const p=FW_CAM.pilot,fl=!!FO.f,fc=$("#foCam"),gc=$("#fwCamGround");
 if(fc)fc.innerHTML=fl&&p?fwCamHtml(p,false):"";
 if(gc){const g=!fl&&!!p;gc.innerHTML=g?fwCamHtml(p,true):"";gc.hidden=!g}
 fwCamStrip()}
function fwCamUi(){const st=$("#foCamSt");if(!st)return;const p=FW_CAM.pilot,V=FWV,P=V.pub||{},ch=(cls,t)=>'<span class="bc-c '+cls+'"><i></i>'+esc(t)+"</span>";
 const n=(P.cams||[]).filter(k=>k.on!==false).length;
 st.innerHTML=FW_CAM.paused?ch("","Paused"):V.ws&&V.role?(P.on?ch("ok","Online")+(P.v?ch("","v"+P.v):"")+ch("",V.mode())+(n?ch("",n+" camera"+(n===1?"":"s")):"")+ch("",V.watchers+" watching"):ch("bad","Offline")+(FW_CAM.manual?ch("","Waiting for Polaris Cam"):"")):V.want?ch("","Connecting…"):fwCamOn(p)?ch("ok","Online"):ch("bad","Offline");
 const wait=V.want&&FW_CAM.manual&&!P.on,b=$("#foCamGo");if(b){b.textContent=wait?"Cancel":V.want?"Pause":FW_CAM.paused||fwCamOn(p)?"Watch":"Connect";
  b.title=wait?"Stop waiting for their Polaris Cam":V.want?"Stop the pictures: their PC sends nothing then":fwCamOn(p)?"See the cockpit cameras":"Wait for their Polaris Cam to come on, and show it then"}
 const g=$("#foCamG");if(g)g.hidden=!V.want;
 const u=$("#foCamUrl");if(u){u.value=FW_CAM.tok?location.origin+"/live/cam/p/"+p+"/"+FW_CAM.tok:"";u.placeholder=FW_CAM.tok?"":"Loading…"}
 V.caps()}
const fwCamSay=(t,ok)=>{const m=$("#foCamSay");if(m)m.innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
/* the pilot's own link (directors): asked for when it is opened, unless their channel's hello brought it */
async function fwCamTokGet(){const p=FW_CAM.pilot;if(!p||FW_CAM.tok)return;
 try{const j=await api("/admin/api/cam?pilot="+encodeURIComponent(p));if(p===FW_CAM.pilot&&j&&j.token){FW_CAM.tok=j.token;fwCamUi()}}catch(e){fwCamSay(e.message)}}
async function fwCamTok(b){const p=FW_CAM.pilot;if(!p)return;
 if(FW_CAM.armT&&Date.now()-FW_CAM.armT<5000){FW_CAM.armT=0;b.textContent="New link";b.disabled=true;
  try{const j=await api("/admin/api/cam",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({op:"token",pilot:p})});
   if(p===FW_CAM.pilot&&j&&j.token){FW_CAM.tok=j.token;fwCamSay("A new link for "+p+": paste it into Polaris Cam on their PC",true)}}
  catch(e){fwCamSay(e.message)}finally{b.disabled=false;fwCamUi()}return}
 FW_CAM.armT=Date.now();b.textContent="Press again: the old link stops";setTimeout(()=>{if(FW_CAM.armT&&Date.now()-FW_CAM.armT>=4900){FW_CAM.armT=0;const x=$('#foCamK [data-fwc="tok"]');if(x)x.textContent="New link"}},5000)}
document.addEventListener("toggle",e=>{const d=e.target;if(d&&d.id==="foCamK"&&d.open)fwCamTokGet()},true);
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("#foCamG [data-camc],[data-fwc],[data-fwcp]");if(!t||t.disabled)return;
 if(t.dataset.camc!=null){FWV.zoomTo(+t.dataset.camc);return}
 if(t.dataset.fwcp){const p=t.dataset.fwcp,f=fwCamFlights()[p];
  if(f&&window.pmLive){FW_CAM.ground="";window.pmLive.show(f.cs);fwCamSync()}else{FW_CAM.ground=FW_CAM.ground===p?"":p;fwCamSync()}return}
 const k=t.dataset.fwc;
 if(k==="go"){if(FWV.want){if(!(FW_CAM.manual&&!(FWV.pub&&FWV.pub.on)))FW_CAM.paused=true;FW_CAM.manual=false}else{FW_CAM.paused=false;FW_CAM.away=false;if(!fwCamOn(FW_CAM.pilot))FW_CAM.manual=true}fwCamSync();return}
 if(k==="x"){FW_CAM.ground="";fwCamSync();return}
 if(k==="copy"){const u=$("#foCamUrl");if(!u||!u.value)return;(navigator.clipboard?navigator.clipboard.writeText(u.value):Promise.reject()).then(()=>fwCamSay("The link is copied",true),()=>{u.select();fwCamSay("Copy the selected link")});return}
 if(k==="tok")fwCamTok(t)});
setInterval(()=>{if(pgNow==="fw"&&!document.hidden)fwCamLoad()},15000);
window.addEventListener("pm:tab",()=>fwCamSync());
window.addEventListener("pm:live",()=>{fwCamRows();fwCamStrip()});
document.addEventListener("visibilitychange",()=>{clearTimeout(FW_CAM.hidT);
 if(document.hidden){FW_CAM.hidT=setTimeout(()=>{if(document.hidden&&!FW_CAM.away){FW_CAM.away=true;fwCamSync()}},60000);return}
 if(FW_CAM.away){FW_CAM.away=false;fwCamSync()}if(pgNow==="fw")fwCamLoad()});
/* open only while the page shows (and it is in view): the PC sends its pictures only then */
PG_LOAD.bc=()=>{BC.want=true;bcOpen();bcAll();bcCamOn()};
window.addEventListener("pm:tab",()=>{if(pgNow!=="bc")bcClose()});
document.addEventListener("visibilitychange",()=>{if(pgNow!=="bc")return;clearTimeout(BC.hidT);if(document.hidden)BC.hidT=setTimeout(()=>{if(document.hidden&&pgNow==="bc")bcClose()},60000);else if(!BC.want){BC.want=true;bcOpen()}});
setInterval(()=>{if(pgNow==="bc"&&!document.hidden)bcClock()},1000);
if(!document.querySelector(".deny")){if(!window.PM_PERM)meLoad();load();preview();if(opsOk("set"))opsGet("set",6e5).then(j=>setApply(j.settings)).catch(()=>{})}
window.addEventListener("hashchange",route);route();
</script>
<script src="/admin/live.js" defer></script></body></html>`;
