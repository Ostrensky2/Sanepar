# Migrations condicionais ainda não aplicadas

`20260815091000_supabase_auth_rls_cutover.sql` permanece pendente e não faz parte da publicação 2.0.2.

O arquivo foi movido de `supabase/migrations` para este diretório, com conteúdo integralmente preservado, para que um `supabase db push` comum não tente encerrar a migração progressiva de autenticação junto com mudanças de campo.

A aplicação futura depende das pré-condições descritas no próprio SQL: 11/11 perfis vinculados, conferências de integridade, desativação da migração legada na janela de corte e diagnóstico aprovado. A mudança de diretório não aplica a migration nem a marca como aplicada no histórico.

O teste isolado de autenticação continua executando este arquivo sobre suas próprias fixtures. Isso não altera o banco de produção.
