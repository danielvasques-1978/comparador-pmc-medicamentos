"""Limites das travas de sanidade da importação CMED.

Ajustar um limite aqui é o caminho previsto quando uma trava barra algo
legítimo. Não existe override em tempo de execução, por decisão de projeto.
"""

VOLUME_MIN_RATIO = -0.05
VOLUME_MAX_RATIO = 0.50
MAX_PRICE_VARIATION = 0.30
MIN_EAN_COVERAGE = 0.90
MAX_CRITICAL_LOSSES = 5
