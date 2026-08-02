

 // reprezentare grafica a miscarii corelate pe axe.
 // nota asupra marimilor de masura:
 //	- distanta se masoara in pasi
 //	- viteza in pasi/secunde
 //	- acceleratia in pasi/secunde/secunde


 #include	<stdio.h>
 #include	<stdlib.h>
 #include	<math.h>
 #include	<conio.h>
 #include 	<dos.h>
 #include 	"datatypes.h"
 #include 	"colors.h"


 #define	MHZ	1193180L


 // variabile globale
 float    	fAcc		 ; // acceleratia comuna a axelor
 float		fVInit		 ; // viteza initiala a axelor
 float    	fVFinalMax       ; // viteza finala maxima
 float 		fVFinal	 	 ; // vitezele finale pt. fiecare axa
 float		fTimpTotal	 ; // timpul total de miscare;
 unsigned 	uNrPasi	 	 ; // nr. pasi total pt. fiecare axa
 unsigned 	uNrPasiPanta	 ; // nr. pasi pe panta pt. fiecare axa
 unsigned 	uNrPasiPalier	 ; // nr. pasi pe palier pt.fiecare axa
 BYTE  		sens		 ; // sensul de rotatie
 unsigned 	*uTimp		 ; // pointer la sirul de 'long' in care se
				   // memoreaza timpii cit dureaza fiecare pas
 unsigned       cnt		 ; // un contor global, pe care il foloseste
				   // noua intrerupere de ceas la baleierea
				   // sirului de constante de timp
 unsigned int far *screen        ; // pointer la ecran in mod text
 BYTE col = 0			 ; // variabile folosite in cadrul
 BYTE car = 0xB0		 ; // intreruperii 0x08
 unsigned far *pLPT1 = (unsigned *) MK_FP( 0x0000, 0x0408 );
 unsigned LPT1;




 // prototipurile functiilor
 void CalculVitezeFinale( void );
 void CalculTimp(         void );
 void AfiseazaValoriCalculate( void );
 void AlocaMemorie(   void );
 void DeAlocaMemorie( void );

 typedef void interrupt intfunc();
 intfunc *oldclock;

 void setClockTo( unsigned );
 void interrupt count( void );








 // ---- Main function ---------------------------------------------------

 void main( void )
 {
	char ch;


	// ---- citirea datelor ------------------------------------------
	clrscr();

	printf("\n\n\n\nNumarul de pasi : ");
	scanf("%u",&uNrPasi);

	printf("\nViteza intiala a axei (in pasi pe secunda) : ");
	scanf("%f",&fVInit);

	printf("\nViteza finala (in pasi pe secunda) : ");
	scanf("%f",&fVFinal);

	printf("\nAcceleratia (in pasi/sec/sec) : ");
	scanf("%f",&fAcc);

	printf("\nSensul de rotatie (S/J) ");
	ch = toupper(getch());
	if( ch== 'S' ) sens = 2;
	if( ch== 'J' ) sens = 0;





	// ---- Start calcule off-line -----------------------------------

	AlocaMemorie();
		CalculTimp();
		//AfiseazaValoriCalculate();


		// initializeaza pointerul la memoria ecran...
		screen = (unsigned int *) MK_FP( 0xB800, 0x0000 );
		// ... si adresa portului paralel ...
		LPT1 = *pLPT1;
		// ... si al contorului din noua intrerupere de ceas...
		cnt = 0;
		// setam ceasul la prima constanta de timp
		// setarile ulterioare la va face noua int08
		setClockTo( uTimp[cnt] );

		// instaleaza noua intrerupere de ceas...
		oldclock = (intfunc *)getvect(0x8);
		setvect(0x8, count);

		while( cnt <= uNrPasi )
		{
			// do nothing
		}

	DeAlocaMemorie();

	// restaureaza vechea int08 si reprogrameaza ceasul la val. init.
	setvect( 0x8, oldclock );
	setClockTo( 0x0000 );
 }
 // ---- End of function main --------------------------------------------













 // ---- Definitia functiilor --------------------------------------------


 // cunoscind acceleratia si viteza initiala comuna axelor,
 // viteza finala maxima precum si numarul de pasi pentru fiecare axa,
 // se calculeaza vitezele finale (de desprindere) pentru fiecare axa
 // acestea se memoreaza in tabloul vFinal[3]
 void CalculVitezeFinale( void )
 {
	// timpul total de miscare este :
	// fTimpTotal = uNrPasi/fVFinal + pow( (fVFinal-fVInit),2 ) / (fAcc * fVFinal) ;
 }




 // functia de mai jos calculeaza tabloul de constante de timp pentru fiecare
 // axa; primeste ca parametri:
 //	- viteza initiala a axei
 //	- viteza de desprindere ( finala ) a axei
 //	- acceleratia ( sau panta ) axei
 //	- numarul total de pasi pentru axa
 // returneaza constantele de timp in tablourile ConstTimp1,2,3
 // in acelasi timp se calculeaza si numarul de pasi necesari parcurgerii
 // pantei
 void  CalculTimp(  void )
 {
	float 	 fVI;    // se foloseste la incrementarea vitezei initiale
	unsigned i, forward;
	unsigned uHalf; // jumatate din numarul total de pasi de executat
	int 	 backward;
	float	 t;


	// initializari . . .
	uHalf = uNrPasi / 2;
	fTimpTotal = 0;		// initializare contor timp total
	forward    = 0;
	backward   = 0;
	i	   = 0;



	if( uTimp != NULL )
	{
	    fVI = fVInit;
	    while( forward < uHalf )
	    {
		uTimp[forward] = (unsigned long)( (1/fVI) * MHZ );
		t = (float)( (sqrt( fVI*fVI+2*fAcc ) - fVI) / fAcc );
		fVI = fVI + fAcc * t;
		forward++;
		if( fVI >= fVFinal ) break;
	    }
	    // aici se termina panta, deci memoram numarul de pasi pe panta;
	    // trebuie sa scadem 1 din forward deoarece aceasta puncteaza
	    // deja spre pasul urmator; forward a fost incrementat inainte sa
	    // iasa din while-ul anterior
	    uNrPasiPanta  = forward - 1;




	    while( forward < uHalf )
	    {
		uTimp[forward] = (unsigned long)( (1/fVFinal) * MHZ );
		// s-a scris 1/fVFinal deoarece distanta pe care se
		// calculeaza timpul este de un singur pas
		forward++;
	    }


	    backward = forward ; // se inverseaza sensul de parcurgere
	    for( i=forward; i<uNrPasi; i++ )
	    {
		 backward--;
		 uTimp[i] = uTimp[backward];
	    }


	    // in final, se calculeaza numarul de pasi pe palier
	    uNrPasiPalier = uNrPasi - 2 * uNrPasiPanta;

	}
}	// end of function





 // noua intrerupere de ceas ...
	void interrupt count( void )
	{
		BYTE command;

		 (*oldclock)();

		 // trimite tact pe portul paralel
		 command = sens + 0x01;
		 outportb( LPT1, command );


		 setClockTo( uTimp[cnt] );


		 screen[col] = WHITE FOREGROUND + BLACK BACKGROUND + car;
		 if(col<79) col++;
			else
			{
				col=0;
				if( car == 0xB0 ) car = 0xB2;
				    else car = 0xB0;
			}
		 cnt++;	// puncteaza catre urmatoarea constanta de timp

		 // trimite 0 pe portul paralel
		 command = command & 0xFE;
		 outportb( LPT1, command );
	}



 // aceasta functie reprogrameaza timer-ul...
	void setClockTo( unsigned timeout )
	{
		disable();
		outportb( 0x43, 0x34 );
		outportb( 0x40, LOBYTE(timeout) );
		outportb( 0x40, HIBYTE(timeout) );
		enable();
	}
















 void AfiseazaValoriCalculate( void )
 {
	unsigned uAux;
	float    fAux;

	clrscr();
	printf(" \nViteza initiala \t\t\t %10.5f", fVInit  );
	printf(" \nViteza finala   \t\t\t %10.5f", fVFinal );
	printf(" \nAcceleratia	   \t\t\t %10.5f", fAcc	   );
	printf(" \nNr. pasi total  \t\t\t %20u  ", uNrPasi );
	printf(" \nNr. pasi panta  \t\t\t %20u  ", uNrPasiPanta );
	printf(" \nNr. pasi palier \t\t\t %20u  ", uNrPasiPalier );
	// verificam . . .
	uAux = uNrPasiPalier  +  2 * uNrPasiPanta;
	printf(" \nNr. pasi total  \t\t\t %20u  ", uAux );
	getch();

	printf("\nTabloul timpilor (cit timp dureaza fiecare pas) ");
	for( uAux = 0; uAux < uNrPasi; uAux++ )
	{
		printf("\n\t\t %u \t\t%10u", uAux, uTimp[uAux] );
	}
 }



 void AlocaMemorie( void )
 {
      uTimp = (unsigned *) malloc( uNrPasi*sizeof(unsigned) );
      if( uTimp == NULL )
      {
		printf("\n\nMemorie insuficienta . . .");
		exit(1);
      }
 }


 void DeAlocaMemorie( void )
 {
	if( uTimp != NULL )
	{
		printf("\n\nDealoc memoria . . . ");
		free( uTimp );
		printf("ok.");
	}
 }



