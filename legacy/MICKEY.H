#ifndef MICKEYH
#define MICKEYH

/*
 Header for the C version of the MICKEY unit.
 By Antonio Carlos Moreirao de Queiroz - acmq@coe.ufrj.br
 See files "xview_pc.txt" and "mickey.txt" for more details.
 Version 1.1 30/4/94
 Version 1.2 01/08/94 - The same header for Borland C/C++ and GNU C
*/

extern int mousex,mousey,mouseb;          /* Mouse status */
extern int cursor_active;                 /* If the mouse is displayed */
#ifdef __TURBOC__
extern int x_factor;                      /* Mouse correction factor */
#endif

#ifdef __cplusplus
extern "C" {
#endif
void  mouse_init(void);            /* Inicialization */
void  cursor_on(void);             /* Shows mouse cursor */
void  cursor_off(void);            /* Hides mouse cursor */
void  mouse_read(void);            /* Fills mouse status */
void  mouse_move(int x,int y);     /* Moves the mouse cursor */
int mkbhit(void);                  /* Key pressed */
#ifdef __cplusplus
}
#endif

#endif
