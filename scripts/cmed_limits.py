"""Limites das travas de sanidade da importação CMED.

Ajustar um limite aqui é o caminho previsto quando uma trava barra algo
legítimo. Não existe override em tempo de execução, por decisão de projeto.
"""

VOLUME_MIN_RATIO = -0.05
VOLUME_MAX_RATIO = 0.50
# Limites de preço assimétricos, por decisão de 19/10/2026. A CMED reprecifica
# alguns medicamentos 40–90% entre edições de forma legítima, então um teto de
# 30% barrava toda edição e exigia adoção manual. O que importa pegar é erro
# grosseiro de dados: um salto para cima tipo ×10 (a Lenvatinibe de 09/2026
# pulou +900% por um dígito a menos na edição anterior) ou um colapso quase
# total (coluna deslocada que zera o preço). Uma queda nunca passa de -100%,
# então o limite de queda é separado e mais baixo que o de alta.
MAX_PRICE_INCREASE = 1.00  # bloqueia altas acima de +100% (ex.: ×10)
MAX_PRICE_DROP = 0.90  # bloqueia quedas acima de 90% (ex.: colapso por bug)
MIN_EAN_COVERAGE = 0.90
MAX_CRITICAL_LOSSES = 5

# O aviso exibido para apresentações sem PMC afirma uso restrito hospitalar.
# Zero exceções toleradas: se a CMED mudar esse padrão, a edição é barrada e a
# redação do aviso é revista deliberadamente.
MAX_PF_SEM_HOSPITALAR = 0
