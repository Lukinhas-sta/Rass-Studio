# Segurança — Rass Studio

Este repositório contém somente o frontend público do Rass Studio. Nenhuma senha, chave secreta, service role, arquivo de ambiente, backup de cliente ou SQL operacional privado deve ser versionado aqui.

## Regras

- A chave publishable do Supabase no frontend é pública por design e depende de RLS.
- Administração usa Supabase Auth e autorização específica de Rass.
- Nunca remover RLS, MFA, CSP ou validação de servidor para contornar erros.
- Nunca adicionar segredos ao navegador ou ao GitHub.
- Testes de disponibilidade em produção devem ser não destrutivos.
