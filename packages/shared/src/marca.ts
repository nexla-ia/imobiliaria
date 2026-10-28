/**
 * Identidade visual padrão (Planejar Assessoria). Valores extraídos da arte
 * "Atendimento Online" enviada pela cliente; em produção vêm de empresas.cor_*.
 */
export const marca = {
  nome: 'Planejar Assessoria',
  creci: 'CRECI 4.447 MT',
  whatsapp: '5565999373761',
  cores: {
    azulNoite: '#000D38',    // fundo principal da arte
    azulProfundo: '#00020E', // cantos escuros do degradê
    azulMarinho: '#0A1F5C',  // superfícies sobre o fundo escuro
    ciano: '#0AC1FA',        // "ONLINE" e linhas de destaque
    cianoEscuro: '#0078A8',  // ciano com contraste AA sobre branco (texto/links)
    cinzaLogo: '#5A5A5A',    // fundo original da logo
    fundoClaro: '#F2F5FA',
    texto: '#0B1433',
    textoSuave: '#4A5578',
    sucesso: '#0E8A4F',
    alerta: '#B45309',
    erro: '#C2283A',
    whatsapp: '#25D366',
  },
} as const;
